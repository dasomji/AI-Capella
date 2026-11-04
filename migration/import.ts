import { randomBytes } from "node:crypto";
import { z } from "zod";
import { pool } from "../server/db/index.server";
import { transaction, lockEnsemble } from "../server/domain.server";
import { insertVersion } from "../server/migration-content.server";
import { env } from "../server/env.server";
import { mailer } from "../server/mail.server";
import { offsetInstant } from "../server/time.server";
import {
  prepare,
  ensembleName,
  legacyOrder,
  transientValidation,
} from "./prepare";
import { canonical, hash, type Snapshot } from "./snapshot";
export const mappingSchema = z.record(
  z.string(),
  z
    .object({
      emails: z.array(z.string().trim().toLowerCase().pipe(z.email())).min(1),
      displayName: z.string().optional(),
    })
    .strict(),
);
export type Mapping = z.infer<typeof mappingSchema>;
export const footprint = (p: any) =>
  hash(
    canonical([
      p.title,
      p.sort_key,
      p.format,
      p.revision,
      p.current_version_id,
      p.part_names,
      p.clef_overrides,
      p.removed_parts,
      p.split_parts,
      p.swing,
      p.saved_config,
      p.format_defaults,
      p.provenance,
    ]),
  );
export function reportBase(snapshot: Snapshot) {
  const now = new Date();
  return {
    sourceProject: snapshot.manifest.project,
    snapshot: hash(canonical(snapshot.manifest)),
    at: now.toISOString(),
    businessTime: offsetInstant(now),
    timeZone: env.APP_TIME_ZONE,
    unknownCollections: snapshot.manifest.unknownCollections ?? [],
    skippedCounts: snapshot.manifest.skippedCounts ?? {},
    skipped: Object.fromEntries(
      Object.entries(snapshot.collections)
        .filter(([k]) => !["ensembles", "songs"].includes(k))
        .map(([k, v]) => [
          k,
          {
            count: snapshot.manifest.skippedCounts?.[k] ?? v.length,
            reason: "intentionally not migrated",
          },
        ]),
    ),
    items: [] as any[],
    invitations: [] as any[],
  };
}
export async function importSnapshot(
  snapshot: Snapshot,
  mapping: Mapping,
  options: {
    dryRun?: boolean;
    sendInvitations?: boolean;
    applyDeletions?: boolean;
    reissueRevoked?: boolean;
    rotateInvitations?: boolean;
    allowSourceProjectChange?: boolean;
    checkpoint?: (report: any) => Promise<void>;
  } = {},
) {
  mapping = mappingSchema.parse(mapping);
  const report = reportBase(snapshot);
  const project = snapshot.manifest.project;
  Object.assign(report, { mappingHash: hash(canonical(mapping)) });
  const foreign = (
    await pool.query(
      "select distinct source_project from legacy_import_map where source_project<>$1",
      [project],
    )
  ).rows;
  if (foreign.length && !options.allowSourceProjectChange)
    throw Error(
      "Different source project in database; use --allow-source-project-change after operator review",
    );
  if (foreign.length)
    report.items.push({ status: "source_project_change", projects: foreign });
  const prepared = new Map<string, Awaited<ReturnType<typeof prepare>>>();
  const ensembles = snapshot.collections.ensembles.filter(
    (r) => r.path === "ensembles/" + r.id && r.id !== "public",
  );
  const ids = new Set(ensembles.map((e) => e.id));
  for (const r of snapshot.collections.songs) {
    if (r.data.ensemble === "public") {
      report.items.push({ id: r.id, status: "skipped_public" });
      continue;
    }
    if (!ids.has(r.data.ensemble)) {
      report.items.push({
        id: r.id,
        status: r.data.ensemble ? "unknown_ensemble" : "orphan",
        quarantined: true,
      });
      continue;
    }
    try {
      prepared.set(r.id, await prepare(r));
    } catch (error) {
      report.items.push({
        id: r.id,
        status: transientValidation(error)
          ? "transient_validation_failed"
          : "malformed",
        quarantined: !transientValidation(error),
        error: String(error),
      });
    }
  }
  for (const key of Object.keys(mapping))
    if (!ids.has(key))
      report.items.push({ id: key, status: "mapping_without_ensemble" });
  const removed = (
    await pool.query(
      "select legacy_id from legacy_import_map where source_project=$1 and collection='ensembles'",
      [project],
    )
  ).rows;
  for (const old of removed)
    if (!ids.has(old.legacy_id))
      report.items.push({
        ensemble: old.legacy_id,
        status: "ensemble_deleted_in_legacy",
      });
  for (const e of ensembles) {
    const deliveries: any[] = [];
    const items: any[] = [];
    try {
      await transaction(async (db) => {
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          "legacy:" + project + ":" + e.id,
        ]);
        let map = (
          await db.query(
            "select * from legacy_import_map where source_project=$1 and collection='ensembles' and legacy_id=$2",
            [project, e.id],
          )
        ).rows[0];
        const { name, changed } = ensembleName(
          e.id,
          e.data,
          mapping[e.id]?.displayName,
        );
        if (changed)
          items.push({
            ensemble: e.id,
            status: "ensemble_name_substituted",
            name,
          });
        const ensembleHash = hash(
          canonical(
            Object.fromEntries(
              Object.entries(e.data).filter(
                ([k]) => !["codeId", "leaderCodeId"].includes(k),
              ),
            ),
          ),
        );
        if (!map) {
          const entity = (
            await db.query(
              "insert into ensembles(name,awaiting_lead) values($1,true) returning id",
              [name],
            )
          ).rows[0];
          map = { entity_id: entity.id };
          await db.query(
            "insert into legacy_import_map(source_project,collection,legacy_id,entity_id,content_hash,baseline) values($1,'ensembles',$2,$3,$4,$5)",
            [project, e.id, entity.id, ensembleHash, JSON.stringify({ name })],
          );
        }
        await lockEnsemble(db, map.entity_id);
        const ensemble = map.entity_id;
        const existingEnsemble = (
          await db.query("select name from ensembles where id=$1", [ensemble])
        ).rows[0];
        if (map.baseline && existingEnsemble.name !== map.baseline.name) {
          items.push({
            ensemble: e.id,
            status: "conflict",
            field: "ensemble_name",
          });
        } else if (
          map.baseline &&
          (name !== map.baseline.name || map.content_hash !== ensembleHash)
        ) {
          await db.query("update ensembles set name=$1 where id=$2", [
            name,
            ensemble,
          ]);
          await db.query(
            "update legacy_import_map set content_hash=$1,baseline=$2,updated_at=now() where id=$3",
            [ensembleHash, JSON.stringify({ name }), map.id],
          );
        }

        const leads = (
          await db.query(
            "select count(*)::int as n from memberships where ensemble_id=$1 and is_lead",
            [ensemble],
          )
        ).rows[0].n;
        if (!leads)
          items.push({
            ensemble: e.id,
            status: "awaiting_lead",
            mappingMissing: !mapping[e.id],
          });
        for (const email of new Set(mapping[e.id]?.emails ?? [])) {
          const existing = (
            await db.query(
              "select * from invitations where ensemble_id=$1 and email=$2",
              [ensemble, email],
            )
          ).rows;
          if (existing.some((i) => i.state === "accepted")) continue;
          if (
            existing.some((i) => i.state === "pending" && i.kind !== "lead")
          ) {
            items.push({
              ensemble: e.id,
              email,
              status: "member_invitation_conflict",
              action:
                "Revoke the member invitation, review the lead mapping, then rerun import.",
            });
            continue;
          }
          const latest = existing
            .filter((i) => i.kind === "lead")
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            )[0];
          if (latest?.state === "revoked" && !options.reissueRevoked) {
            items.push({
              ensemble: e.id,
              email,
              status: "revoked_invitation_skipped",
              action:
                "Review revocation; --reissue-revoked explicitly authorizes a new grant.",
            });
            continue;
          }
          const expired =
            latest?.state === "expired" ||
            (latest?.state === "pending" &&
              new Date(latest.expires_at).getTime() <= Date.now());
          if (expired)
            items.push({
              ensemble: e.id,
              email,
              status: "expired_invitation",
              action: "Use --rotate-invitations after review.",
            });
          if (
            (expired || existing.some((i) => i.state === "pending")) &&
            !options.sendInvitations &&
            !options.rotateInvitations
          )
            continue;
          const raw = randomBytes(32).toString("base64url");
          await db.query(
            "update invitations set state='revoked',revoked_at=now() where ensemble_id=$1 and email=$2 and state='pending'",
            [ensemble, email],
          );
          const inv = (
            await db.query(
              "insert into invitations(ensemble_id,email,kind,token_hash,expires_at,migration_source_project) values($1,$2,'lead',$3,$4,$5) returning id",
              [
                ensemble,
                email,
                hash(raw),
                new Date(Date.now() + 336 * 3600000),
                project,
              ],
            )
          ).rows[0];
          deliveries.push({
            id: inv.id,
            email,
            url: env.BETTER_AUTH_URL + "/invite/" + raw,
            ensemble: e.id,
            ensembleName: name,
          });
        }
        const songs = [...prepared.values()]
          .filter((p) => p.row.data.ensemble === e.id)
          .sort(
            (a, b) =>
              legacyOrder(a.row) - legacyOrder(b.row) ||
              Buffer.compare(Buffer.from(a.row.id), Buffer.from(b.row.id)),
          );
        const nativeKeys = (
          await db.query(
            "select p.sort_key from music_pieces p where p.ensemble_id=$1 and not exists(select 1 from legacy_import_map m where m.entity_id=p.id and m.collection='songs' and m.source_project=$2) order by p.sort_key collate \"C\" desc limit 1",
            [ensemble, project],
          )
        ).rows;
        const keyStart = nativeKeys.length
          ? BigInt(nativeKeys[0].sort_key) + 1n
          : 0n;
        for (const [index, p] of songs.entries()) {
          const key = String(keyStart + BigInt(index)).padStart(12, "0");
          const old = (
            await db.query(
              "select * from legacy_import_map where source_project=$1 and collection='songs' and legacy_id=$2 for update",
              [project, p.row.id],
            )
          ).rows[0];
          let current = old
            ? (
                await db.query("select * from music_pieces where id=$1", [
                  old.entity_id,
                ])
              ).rows[0]
            : null;
          if (
            old &&
            (!current ||
              current.ensemble_id !== ensemble ||
              footprint(current) !== old.baseline?.fingerprint)
          ) {
            items.push({ id: p.row.id, status: "conflict" });
            continue;
          }
          if (
            old &&
            old.content_hash === p.contentHash &&
            current.sort_key === key
          ) {
            items.push({
              id: p.row.id,
              status: "unchanged",
              titleChanged: p.titleChanged,
              title: p.title,
            });
            continue;
          }
          if (!current)
            current = (
              await db.query(
                "insert into music_pieces(ensemble_id,title,sort_key,format) values($1,$2,$3,$4) returning *",
                [ensemble, p.title, key, p.format],
              )
            ).rows[0];
          const n = (
            await db.query(
              "select coalesce(max(version_no),0)::int+1 as n from score_versions where piece_id=$1",
              [current.id],
            )
          ).rows[0].n;
          const currentScore = current.current_version_id
            ? (
                await db.query(
                  "select content_hash from score_versions where id=$1",
                  [current.current_version_id],
                )
              ).rows[0]
            : null;
          if (
            !currentScore ||
            currentScore.content_hash !== p.scoreHash ||
            current.format !== p.format
          )
            await insertVersion(
              db,
              ensemble,
              current.id,
              null,
              n,
              { format: p.format, schemaVersion: 1 },
              p.validated,
            );
          const s = p.settings;
          current = (
            await db.query(
              "update music_pieces set title=$2,sort_key=$3,part_names=$4,clef_overrides=$5,removed_parts=$6,split_parts=$7,swing=$8,saved_config=$9,format_defaults=$10,provenance=$11,revision=revision+$12 where id=$1 returning *",
              [
                current.id,
                p.title,
                key,
                s.part_names,
                s.clef_overrides,
                s.removed_parts,
                s.split_parts,
                s.swing,
                s.saved_config,
                s.format_defaults,
                JSON.stringify(p.provenance),
                old ? 1 : 0,
              ],
            )
          ).rows[0];
          await db.query(
            "insert into legacy_import_map(source_project,collection,legacy_id,entity_id,content_hash,imported_revision,baseline) values($1,'songs',$2,$3,$4,$5,$6) on conflict(source_project,collection,legacy_id) do update set content_hash=excluded.content_hash,imported_revision=excluded.imported_revision,baseline=excluded.baseline,updated_at=now()",
            [
              project,
              p.row.id,
              current.id,
              p.contentHash,
              current.revision,
              JSON.stringify({ fingerprint: footprint(current) }),
            ],
          );
          await db.query(
            "insert into audit_events(ensemble_id,action,target_id,outcome,metadata) values($1,'migration.import',$2,'ok',$3)",
            [
              ensemble,
              current.id,
              JSON.stringify({ legacyId: p.row.id, snapshot: report.snapshot }),
            ],
          );
          items.push({
            id: p.row.id,
            status: old ? "updated" : "created",
            unmapped: p.unmapped,
            titleChanged: p.titleChanged,
            title: p.title,
          });
        }
        const present = new Set(snapshot.collections.songs.map((s) => s.id));
        const prior = (
          await db.query(
            "select m.*,p.ensemble_id from legacy_import_map m join music_pieces p on p.id=m.entity_id where m.source_project=$1 and m.collection='songs' and p.ensemble_id=$2",
            [project, ensemble],
          )
        ).rows;
        for (const old of prior)
          if (!present.has(old.legacy_id)) {
            const p = (
              await db.query("select * from music_pieces where id=$1", [
                old.entity_id,
              ])
            ).rows[0];
            if (footprint(p) !== old.baseline?.fingerprint) {
              items.push({ id: old.legacy_id, status: "deletion_conflict" });
              continue;
            }
            items.push({
              id: old.legacy_id,
              status: "deleted_in_legacy",
              applied: !!options.applyDeletions,
            });
            if (options.applyDeletions) {
              await db.query(
                "insert into audit_events(ensemble_id,action,target_id,outcome,metadata) values($1,'migration.delete',$2,'ok',$3)",
                [
                  ensemble,
                  p.id,
                  JSON.stringify({
                    legacyId: old.legacy_id,
                    snapshot: report.snapshot,
                  }),
                ],
              );
              await db.query(
                "update music_pieces set current_version_id=null where id=$1",
                [p.id],
              );
              await db.query("delete from score_versions where piece_id=$1", [
                p.id,
              ]);
              await db.query("delete from music_pieces where id=$1", [p.id]);
              await db.query("delete from legacy_import_map where id=$1", [
                old.id,
              ]);
            }
          }
        if (!options.dryRun && options.checkpoint) {
          const pending = {
            ...report,
            items: [...report.items, ...items],
            invitations: [
              ...report.invitations,
              ...deliveries.map((d) => ({
                ...d,
                status: "commit_unconfirmed",
              })),
            ],
          };
          await options.checkpoint(pending);
        }
        if (options.dryRun) {
          await db.query("set constraints all immediate");
          throw new Error("DRY_RUN_ROLLBACK");
        }
      });
    } catch (error) {
      if (!(options.dryRun && String(error) === "Error: DRY_RUN_ROLLBACK")) {
        report.items.push({
          ensemble: e.id,
          status: "ensemble_failed",
          error: String(error),
        });
        continue;
      }
    }
    report.items.push(...items);
    // Persist every committed raw token before mail delivery or processing the next ensemble.
    for (const delivery of deliveries)
      report.invitations.push(
        options.dryRun
          ? { email: delivery.email, ensemble: e.id, status: "would_create" }
          : { ...delivery, status: "not_sent" },
      );
    await options.checkpoint?.(report);
    if (!options.dryRun && options.sendInvitations)
      for (const delivery of deliveries) {
        const entry = report.invitations.find((i) => i.id === delivery.id);
        try {
          await mailer.send({
            to: delivery.email,
            subject: "LightScore – ensemble lead invitation / Ensemble-Leitung",
            text: `Du wurdest als Leitung für „${delivery.ensembleName}“ eingeladen. Wir übertragen das Repertoire aus der bisherigen LightScore-App. Erstelle ein Konto mit dieser E-Mail-Adresse und nimm die Einladung an. Mitglieder werden anschließend von dir eingeladen.\n\nYou are invited to lead “${delivery.ensembleName}”. We are migrating the repertoire from the previous LightScore app. Create an account with this email address and accept the invitation; you can then invite members.\n\n${delivery.url}\n\nFalls du dies nicht erwartet hast, kontaktiere den Betreiber. / If unexpected, contact the operator.`,
            idempotencyKey: "migration-" + delivery.id,
          });
          await pool.query(
            "update invitations set delivery_state='sent',send_count=send_count+1,last_sent_at=now() where id=$1",
            [delivery.id],
          );
          entry.status = "sent";
        } catch {
          entry.status = "delivery_failed";
        }
        await options.checkpoint?.(report);
      }
  }
  return report;
}
