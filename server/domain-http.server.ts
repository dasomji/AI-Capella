import { Hono } from "hono";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { currentSession } from "./auth.server";
import { pool } from "./db/index.server";
import {
  DomainError,
  transaction,
  authorize,
  lockEnsemble,
  protectLead,
  audit,
  membershipChanged,
  libraryChanged,
} from "./domain.server";
import {
  ensembleInput,
  memberInput,
  invitationInput,
  createPieceInput,
  versionInput,
  settingsInput,
  reorderInput,
  contentInput,
} from "../src/api/domain";
import { mailer } from "./mail.server";
import { env } from "./env.server";
import { logError } from "./logger.server";
import type { PoolClient } from "pg";
export const domain = new Hono<{
  Variables: { user: { id: string; email: string; name: string } };
}>();
// Injectable application clock; tests change it in-process, never through HTTP or environment bypasses.
export const clock = { now: () => new Date() };
function canonicalJSON(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJSON).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => JSON.stringify(key) + ":" + canonicalJSON(value))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const caps = (m: Record<string, unknown>) => ({
  manageMembers: !!(m.is_lead || m.manage_members),
  editPieces: !!(m.is_lead || m.edit_music_pieces),
  transcribe: !!(m.is_lead || m.ai_transcription),
});
const memberView = (m: Record<string, unknown>) => ({
  id: m.id,
  userId: m.user_id,
  ensembleId: m.ensemble_id,
  name: m.name,
  email: m.email,
  isLead: m.is_lead,
  capabilities: caps(m),
});
const requestKeys = (i: Record<string, any>): string[] => {
  try {
    const value = JSON.parse(i.request_key);
    return Array.isArray(value) ? value : [i.request_key];
  } catch {
    return i.request_key ? [i.request_key] : [];
  }
};
const inviteState = (i: Record<string, unknown>) =>
  i.state === "pending" && new Date(String(i.expires_at)) <= clock.now()
    ? "expired"
    : i.state;
const inviteView = (i: Record<string, unknown>) => ({
  id: i.id,
  email: i.email,
  state: inviteState(i),
  expiresAt: i.expires_at,
  deliveryState: i.delivery_state,
  sendCount: i.send_count,
  capabilities: caps(i),
});
domain.onError((error, c) => {
  if (error instanceof DomainError)
    return c.json(
      { code: error.code, current: error.current },
      error.status as 400,
    );
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return c.json({ code: "invalid_input" }, 400);
  logError("domain.http", error);
  return c.json({ code: "service_unavailable" }, 500);
});
domain.get("/invitations/:token", async (c) => {
  const i = (
    await pool.query(
      'select i.*,e.name as ensemble_name,u.name as inviter_name from invitations i join ensembles e on e.id=i.ensemble_id left join "user" u on u.id=i.inviter_id where token_hash=$1',
      [hash(c.req.param("token"))],
    )
  ).rows[0];
  if (!i) throw new DomainError("not_found", 404);
  return c.json({
    ensembleName: i.ensemble_name,
    inviter: i.inviter_name,
    email: i.email.replace(/^(.).*(@.*)$/, "$1***$2"),
    state: inviteState(i),
    callbackURL: `${env.BETTER_AUTH_URL}/invite/${encodeURIComponent(c.req.param("token"))}`,
  });
});
domain.use("*", async (c, next) => {
  const s = await currentSession(c.req.raw.headers);
  if (!s?.user.emailVerified) return c.json({ code: "SESSION_EXPIRED" }, 401);
  c.set("user", s.user);
  await next();
});
domain.get("/ensembles", async (c) => {
  const rows = await pool.query(
    "select e.*,m.id as membership_id,m.user_id,m.is_lead,m.manage_members,m.edit_music_pieces,m.ai_transcription from ensembles e join memberships m on m.ensemble_id=e.id where m.user_id=$1 order by e.name",
    [c.get("user").id],
  );
  return c.json(
    rows.rows.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      isLead: e.is_lead,
      membershipId: e.membership_id,
      capabilities: caps(e),
    })),
  );
});
domain.post("/ensembles", async (c) => {
  const input = ensembleInput.parse(await c.req.json()),
    u = c.get("user");
  const result = await transaction(async (db) => {
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      u.id,
    ]);
    const e = (
      await db.query(
        "insert into ensembles(name,kind) values($1,$2) returning *",
        [input.name, input.kind],
      )
    ).rows[0];
    await db.query(
      "insert into memberships(ensemble_id,user_id,is_lead) values($1,$2,true)",
      [e.id, u.id],
    );
    await audit(db, e.id, u.id, "ensemble.create", e.id);
    return e;
  });
  return c.json(result, 201);
});
domain.patch("/ensembles/:ensemble", async (c) => {
  const input = ensembleInput.pick({ name: true }).parse(await c.req.json()),
    e = c.req.param("ensemble"),
    u = c.get("user");
  return c.json(
    await transaction(async (db) => {
      await lockEnsemble(db, e);
      await authorize(db, u.id, e, "lead");
      const result = await db.query(
        "update ensembles set name=$1 where id=$2 returning id,name,kind",
        [input.name, e],
      );
      await audit(db, e, u.id, "ensemble.rename", e);
      return result.rows[0];
    }),
  );
});
domain.get("/ensembles/:ensemble/members", async (c) => {
  const e = c.req.param("ensemble");
  await authorize(pool, c.get("user").id, e, "manageMembers");
  return c.json(
    (
      await pool.query(
        'select m.*,u.name,u.email from memberships m join "user" u on u.id=m.user_id where ensemble_id=$1',
        [e],
      )
    ).rows.map(memberView),
  );
});
domain.patch("/ensembles/:ensemble/members/:member", async (c) => {
  const input = memberInput.parse(await c.req.json()),
    e = c.req.param("ensemble"),
    id = c.req.param("member"),
    u = c.get("user");
  const result = await transaction(async (db) => {
    await lockEnsemble(db, e);
    const actor = await authorize(db, u.id, e, "lead");
    const m = (
      await db.query(
        "select * from memberships where id=$1 and ensemble_id=$2",
        [id, e],
      )
    ).rows[0];
    if (!m) throw new DomainError("not_found", 404);
    if (input.stepDown && m.user_id === u.id && input.isLead)
      throw new DomainError("invalid_input");
    if (input.isLead === false && m.is_lead) await protectLead(db, e, m);
    const result = (
      await db.query(
        "update memberships set is_lead=coalesce($1,is_lead),manage_members=coalesce($2,manage_members),edit_music_pieces=coalesce($3,edit_music_pieces),ai_transcription=coalesce($4,ai_transcription) where id=$5 returning *",
        [
          input.isLead,
          input.manageMembers,
          input.editPieces,
          input.transcribe,
          id,
        ],
      )
    ).rows[0];
    if (input.stepDown) {
      if (!input.isLead || m.user_id === u.id)
        throw new DomainError("invalid_transfer");
      await protectLead(db, e, actor);
      await db.query("update memberships set is_lead=false where id=$1", [
        actor.id,
      ]);
    }
    await audit(db, e, u.id, "membership.permissions", id);
    return memberView(result);
  });
  membershipChanged(e);
  return c.json(result);
});
domain.delete("/ensembles/:ensemble/members/:member", async (c) => {
  const e = c.req.param("ensemble"),
    id = c.req.param("member"),
    u = c.get("user");
  let removed = "";
  await transaction(async (db) => {
    await lockEnsemble(db, e);
    const actor = await authorize(db, u.id, e);
    const m = (
      await db.query(
        "select * from memberships where ensemble_id=$1 and id=$2",
        [e, id],
      )
    ).rows[0];
    if (!m) throw new DomainError("not_found", 404);
    if (m.user_id !== u.id) {
      await authorize(db, u.id, e, "manageMembers");
      if (m.is_lead && !actor.is_lead) throw new DomainError("forbidden", 403);
    }
    await protectLead(db, e, m);
    await db.query("delete from memberships where id=$1", [id]);
    await audit(
      db,
      e,
      u.id,
      m.user_id === u.id ? "membership.leave" : "membership.remove",
      id,
    );
    removed = m.user_id;
  });
  membershipChanged(e, removed);
  return c.json({ status: true });
});
domain.delete("/account", async (c) => {
  const u = c.get("user");
  await transaction(async (db) => {
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      u.id,
    ]);
    const es = await db.query(
      "select ensemble_id from memberships where user_id=$1 order by ensemble_id",
      [u.id],
    );
    for (const { ensemble_id: e } of es.rows) {
      await lockEnsemble(db, e);
      const m = await authorize(db, u.id, e);
      await protectLead(db, e, m);
      await audit(db, e, u.id, "membership.leave", m.id);
    }
    await db.query('delete from "user" where id=$1', [u.id]);
  });
  membershipChanged("", u.id);
  return c.json({ status: true });
});
async function sendInvite(
  db: Pick<PoolClient, "query">,
  i: Record<string, any>,
  raw: string,
) {
  const e = (
    await db.query("select name from ensembles where id=$1", [i.ensemble_id])
  ).rows[0];
  const u = (
    await db.query('select name from "user" where id=$1', [i.inviter_id])
  ).rows[0];
  const de = i.language === "de";
  try {
    await mailer.send({
      idempotencyKey: `invitation-${i.id}-${i.send_count}`,
      to: i.email,
      subject: de ? `Einladung zu ${e.name}` : `Invitation to ${e.name}`,
      text: `${u?.name ?? "LightScore"} ${de ? "lädt dich ein zu" : "invites you to"} ${e.name}:\n${env.BETTER_AUTH_URL}/invite/${raw}`,
    });
    i.delivery_state = "sent";
  } catch (error) {
    logError("invitation.delivery", error);
    i.delivery_state = "not_sent";
  }
  await db.query(
    "update invitations set delivery_state=$1 where id=$2 and token_hash=$3",
    [i.delivery_state, i.id, i.token_hash],
  );
}
domain.get("/ensembles/:ensemble/invitations", async (c) => {
  const e = c.req.param("ensemble");
  await authorize(pool, c.get("user").id, e, "manageMembers");
  return c.json(
    (
      await pool.query(
        "select * from invitations where ensemble_id=$1 order by created_at",
        [e],
      )
    ).rows.map(inviteView),
  );
});
domain.post("/ensembles/:ensemble/invitations", async (c) => {
  const input = invitationInput.parse(await c.req.json()),
    e = c.req.param("ensemble"),
    u = c.get("user");
  const delivery = await transaction(async (db) => {
    await lockEnsemble(db, e);
    const actor = await authorize(db, u.id, e, "manageMembers");
    const cap = input.capabilities ?? {
      manageMembers: false,
      editPieces: false,
      transcribe: false,
    };
    if (!actor.is_lead && Object.values(cap).some(Boolean))
      throw new DomainError("forbidden", 403);
    if (
      (
        await db.query(
          'select m.id from memberships m join "user" u on u.id=m.user_id where ensemble_id=$1 and u.email=$2',
          [e, input.email],
        )
      ).rowCount
    )
      throw new DomainError("already_member", 409);
    const old = (
      await db.query(
        "select * from invitations where ensemble_id=$1 and email=$2 and state='pending' for update",
        [e, input.email],
      )
    ).rows[0];
    if (old && requestKeys(old).includes(input.idempotencyKey))
      return { invitation: old, raw: undefined as string | undefined };
    if (old) {
      if (old.send_count >= 5) throw new DomainError("send_limit", 429);
      if (clock.now().getTime() - new Date(old.last_sent_at).getTime() < 60000)
        throw new DomainError("send_cooldown", 429);
    }
    const recipient = (
      await db.query('select language from "user" where email=$1', [
        input.email,
      ])
    ).rows[0];
    const raw = randomBytes(32).toString("base64url"),
      expiry = new Date(clock.now().getTime() + 14 * 86400000);
    const i = (
      await db.query(
        `insert into invitations(ensemble_id,email,inviter_id,token_hash,expires_at,manage_members,edit_music_pieces,ai_transcription,language,request_key,send_count,last_sent_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11) on conflict(ensemble_id,email) where state='pending' do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,inviter_id=excluded.inviter_id,manage_members=excluded.manage_members,edit_music_pieces=excluded.edit_music_pieces,ai_transcription=excluded.ai_transcription,language=excluded.language,request_key=excluded.request_key,delivery_state='not_sent',send_count=invitations.send_count+1,last_sent_at=excluded.last_sent_at returning *`,
        [
          e,
          input.email,
          u.id,
          hash(raw),
          expiry,
          cap.manageMembers,
          cap.editPieces,
          cap.transcribe,
          input.language ?? recipient?.language ?? "en",
          JSON.stringify([
            ...(old ? requestKeys(old) : []),
            input.idempotencyKey,
          ]),
          clock.now(),
        ],
      )
    ).rows[0];

    await audit(
      db,
      e,
      u.id,
      old ? "invitation.resend" : "invitation.create",
      i.id,
    );
    return { invitation: i, raw };
  });
  if (delivery.raw) await sendInvite(pool, delivery.invitation, delivery.raw);
  return c.json(inviteView(delivery.invitation), 201);
});
domain.post(
  "/ensembles/:ensemble/invitations/:invitation/resend",
  async (c) => {
    const { idempotencyKey } = z
        .object({ idempotencyKey: z.string().min(1).max(200) })
        .strict()
        .parse(await c.req.json()),
      e = c.req.param("ensemble"),
      u = c.get("user");
    const delivery = await transaction(async (db) => {
      await lockEnsemble(db, e);
      await authorize(db, u.id, e, "manageMembers");
      const i = (
        await db.query(
          "select * from invitations where id=$1 and ensemble_id=$2 for update",
          [c.req.param("invitation"), e],
        )
      ).rows[0];
      if (!i) throw new DomainError("not_found", 404);
      if (requestKeys(i).includes(idempotencyKey))
        return { invitation: i, raw: undefined as string | undefined };
      if (i.state !== "pending") throw new DomainError(i.state);
      if (i.send_count >= 5) throw new DomainError("send_limit", 429);
      if (clock.now().getTime() - new Date(i.last_sent_at).getTime() < 60000)
        throw new DomainError("send_cooldown", 429);
      const raw = randomBytes(32).toString("base64url");
      Object.assign(
        i,
        (
          await db.query(
            "update invitations set token_hash=$1,expires_at=$2,request_key=$3,delivery_state='not_sent',send_count=send_count+1,last_sent_at=$4 where id=$5 returning *",
            [
              hash(raw),
              new Date(clock.now().getTime() + 14 * 86400000),
              JSON.stringify([...requestKeys(i), idempotencyKey]),
              clock.now(),
              i.id,
            ],
          )
        ).rows[0],
      );

      await audit(db, e, u.id, "invitation.resend", i.id);
      return { invitation: i, raw };
    });
    if (delivery.raw) await sendInvite(pool, delivery.invitation, delivery.raw);
    return c.json(inviteView(delivery.invitation));
  },
);
domain.delete("/ensembles/:ensemble/invitations/:invitation", async (c) => {
  const e = c.req.param("ensemble"),
    u = c.get("user");
  await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "manageMembers");
    const i = (
      await db.query(
        "select * from invitations where ensemble_id=$1 and id=$2 for update",
        [e, c.req.param("invitation")],
      )
    ).rows[0];
    if (!i) throw new DomainError("not_found", 404);
    if (i.state === "accepted") throw new DomainError("already_used", 409);
    await db.query(
      "update invitations set state='revoked',revoked_at=$1 where id=$2",
      [clock.now(), i.id],
    );
    await audit(db, e, u.id, "invitation.revoke", i.id);
  });
  return c.json({ status: true });
});
domain.post("/invitations/:token/accept", async (c) => {
  const u = c.get("user");
  return c.json(
    await transaction(async (db) => {
      await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        u.id,
      ]);
      const initial = (
        await db.query(
          "select ensemble_id from invitations where token_hash=$1",
          [hash(c.req.param("token"))],
        )
      ).rows[0];
      if (!initial) throw new DomainError("not_found", 404);
      await lockEnsemble(db, initial.ensemble_id);
      const i = (
        await db.query(
          "select * from invitations where token_hash=$1 for update",
          [hash(c.req.param("token"))],
        )
      ).rows[0];
      if (!i) throw new DomainError("not_found", 404);
      if (i.email !== u.email.trim().toLowerCase())
        throw new DomainError("wrong_account", 403);
      if (i.state === "accepted") {
        if (i.accepted_by !== u.id) throw new DomainError("already_used", 409);
        const m = (
          await db.query(
            "select * from memberships where ensemble_id=$1 and user_id=$2",
            [i.ensemble_id, u.id],
          )
        ).rows[0];
        if (!m) throw new DomainError("already_used", 409);
        return memberView(m);
      }
      const state = inviteState(i);
      if (state !== "pending") throw new DomainError(String(state), 409);
      const m = (
        await db.query(
          "insert into memberships(ensemble_id,user_id,manage_members,edit_music_pieces,ai_transcription) values($1,$2,$3,$4,$5) on conflict(ensemble_id,user_id) do nothing returning *",
          [
            i.ensemble_id,
            u.id,
            i.manage_members,
            i.edit_music_pieces,
            i.ai_transcription,
          ],
        )
      ).rows[0];
      if (!m) throw new DomainError("already_member", 409);
      await db.query(
        "update invitations set state='accepted',accepted_at=$1,accepted_by=$2 where id=$3",
        [clock.now(), u.id, i.id],
      );
      await audit(db, i.ensemble_id, u.id, "invitation.accept", i.id);
      return memberView(m);
    }),
  );
});
const metadataSQL = `select p.id,p.ensemble_id as "ensembleId",p.title,p.sort_key as "sortKey",p.format,p.revision,v.version_no as "versionNo",v.content_hash as "contentHash",v.size::float8 as size,p.updated_at as "updatedAt",jsonb_build_object('partNames',p.part_names,'clefOverrides',p.clef_overrides,'removedParts',p.removed_parts,'splitParts',p.split_parts,'swing',p.swing,'savedConfig',p.saved_config,'formatDefaults',p.format_defaults) as settings from music_pieces p join score_versions v on v.id=p.current_version_id`;
async function metadata(db: Pick<PoolClient, "query">, e: string, id: string) {
  const row = (
    await db.query(metadataSQL + " where p.ensemble_id=$1 and p.id=$2", [e, id])
  ).rows[0];
  if (!row) throw new DomainError("not_found", 404);
  return row;
}
async function content(input: z.infer<typeof contentInput>) {
  const raw =
    input.format === "musicxml" ? input.body : canonicalJSON(input.body);
  if (Buffer.byteLength(raw) > env.SCORE_MAX_BYTES)
    throw new DomainError("score_too_large", 413);
  if (input.format === "musicxml") {
    if (/<!ENTITY/i.test(raw) || XMLValidator.validate(raw) !== true)
      throw new DomainError("invalid_xml");
    const parsed = new XMLParser({
      ignoreAttributes: false,
      processEntities: false,
    }).parse(raw);
    const roots = Object.keys(parsed).filter(
      (key) => !key.startsWith("?") && key !== "!DOCTYPE",
    );
    if (roots.length !== 1) throw new DomainError("invalid_xml");
    const root = parsed["score-partwise"] ?? parsed["score-timewise"];
    const hasNote = (v: unknown): boolean =>
      !!v &&
      typeof v === "object" &&
      Object.entries(v).some(([k, v]) => k === "note" || hasNote(v));
    const partWithNotes = (value: unknown): boolean =>
      !!value &&
      typeof value === "object" &&
      Object.entries(value).some(([key, value]) =>
        key === "part" ? hasNote(value) : partWithNotes(value),
      );
    if (!root || !partWithNotes(root)) throw new DomainError("empty_score");
  }
  return { raw, hash: hash(raw), size: Buffer.byteLength(raw) };
}
async function insertVersion(
  db: PoolClient,
  e: string,
  p: string,
  u: string,
  n: number,
  input: z.infer<typeof contentInput>,
) {
  const data = await content(input);
  const v = (
    await db.query(
      "insert into score_versions(ensemble_id,piece_id,version_no,created_by,format,schema_version,musicxml,native_score,content_hash,size) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
      [
        e,
        p,
        n,
        u,
        input.format,
        input.schemaVersion,
        input.format === "musicxml" ? data.raw : null,
        input.format === "score" ? data.raw : null,
        data.hash,
        data.size,
      ],
    )
  ).rows[0];
  await db.query(
    "update music_pieces set current_version_id=$1,format=$2 where id=$3",
    [v.id, input.format, p],
  );
}
domain.get("/ensembles/:ensemble/pieces", async (c) => {
  const e = c.req.param("ensemble");
  await authorize(pool, c.get("user").id, e);
  return c.json(
    (
      await pool.query(
        metadataSQL +
          ' where p.ensemble_id=$1 order by p.sort_key collate "C",p.id',
        [e],
      )
    ).rows,
  );
});
domain.get("/ensembles/:ensemble/pieces/:piece", async (c) => {
  const e = c.req.param("ensemble");
  await authorize(pool, c.get("user").id, e);
  return c.json(await metadata(pool, e, c.req.param("piece")));
});
domain.get(
  "/ensembles/:ensemble/pieces/:piece/versions/:version",
  async (c) => {
    const e = c.req.param("ensemble");
    await authorize(pool, c.get("user").id, e);
    const v = (
      await pool.query(
        "select * from score_versions where ensemble_id=$1 and piece_id=$2 and (version_no::text=$3 or content_hash=$3)",
        [e, c.req.param("piece"), c.req.param("version")],
      )
    ).rows[0];
    if (!v) throw new DomainError("not_found", 404);
    c.header("ETag", `"${v.content_hash}"`);
    c.header("Cache-Control", "private, max-age=31536000, immutable");
    if (c.req.header("if-none-match") === `"${v.content_hash}"`)
      return c.body(null, 304);
    return c.body(
      v.format === "musicxml" ? v.musicxml : canonicalJSON(v.native_score),
      200,
      {
        "Content-Type":
          v.format === "musicxml"
            ? "application/vnd.recordare.musicxml+xml; charset=utf-8"
            : "application/json",
      },
    );
  },
);
domain.post("/ensembles/:ensemble/pieces", async (c) => {
  const input = createPieceInput.parse(await c.req.json()),
    e = c.req.param("ensemble"),
    u = c.get("user");
  const result = await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "editPieces");
    if (input.idempotencyKey) {
      const old = (
        await db.query(
          "select id from music_pieces where ensemble_id=$1 and idempotency_key=$2",
          [e, input.idempotencyKey],
        )
      ).rows[0];
      if (old) return metadata(db, e, old.id);
    }
    const n = (
      await db.query(
        "select coalesce(max(sort_key::bigint),-1)+1 as n from music_pieces where ensemble_id=$1",
        [e],
      )
    ).rows[0].n;
    const p = (
      await db.query(
        "insert into music_pieces(ensemble_id,title,sort_key,format,idempotency_key) values($1,$2,$3,$4,$5) returning id",
        [
          e,
          input.title,
          String(n).padStart(12, "0"),
          input.content.format,
          input.idempotencyKey,
        ],
      )
    ).rows[0];
    await insertVersion(db, e, p.id, u.id, 1, input.content);
    await audit(db, e, u.id, "piece.create", p.id);
    return metadata(db, e, p.id);
  });
  await libraryChanged(e, [result]);
  return c.json(result, 201);
});
domain.post("/ensembles/:ensemble/pieces/:piece/versions", async (c) => {
  const input = versionInput.parse(await c.req.json()),
    e = c.req.param("ensemble"),
    p = c.req.param("piece"),
    u = c.get("user");
  const result = await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "editPieces");
    const current = await metadata(db, e, p);
    if (current.revision !== input.expectedRevision)
      throw new DomainError("revision_conflict", 409, current);
    await insertVersion(db, e, p, u.id, current.versionNo + 1, input.content);
    await db.query("update music_pieces set revision=revision+1 where id=$1", [
      p,
    ]);
    return metadata(db, e, p);
  });
  await libraryChanged(e, [result]);
  return c.json(result);
});
domain.patch("/ensembles/:ensemble/pieces/:piece", async (c) => {
  const input = settingsInput.parse(await c.req.json()),
    e = c.req.param("ensemble"),
    p = c.req.param("piece"),
    u = c.get("user");
  const result = await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "editPieces");
    const current = await metadata(db, e, p);
    if (
      (input.op === "replace" && input.expectedRevision === undefined) ||
      (input.expectedRevision !== undefined &&
        current.revision !== input.expectedRevision)
    )
      throw new DomainError("revision_conflict", 409, current);
    const columns = {
      partName: "part_names",
      clef: "clef_overrides",
      removed: "removed_parts",
      split: "split_parts",
      saved: "saved_config",
      defaults: "format_defaults",
    };
    if (input.op === "title") {
      const title = z.string().trim().min(1).max(500).parse(input.value);
      await db.query(
        "update music_pieces set title=$1,revision=revision+1 where id=$2",
        [title, p],
      );
    } else if (input.op === "swing") {
      await db.query(
        "update music_pieces set swing=$1,revision=revision+1 where id=$2",
        [z.boolean().parse(input.value), p],
      );
    } else if (input.op === "replace") {
      const obj = z.record(z.string(), z.json()).parse(input.value);
      await db.query(
        "update music_pieces set saved_config=$1,revision=revision+1 where id=$2",
        [JSON.stringify(obj), p],
      );
    } else {
      if (!input.key) throw new DomainError("invalid_input");
      const column = columns[input.op];
      await db.query(
        input.value === null
          ? `update music_pieces set ${column}=coalesce(${column},'{}'::jsonb)-$1::text,revision=revision+1 where id=$2`
          : `update music_pieces set ${column}=jsonb_set(coalesce(${column},'{}'::jsonb),array[$1::text],$3::jsonb,true),revision=revision+1 where id=$2`,
        input.value === null
          ? [input.key, p]
          : [input.key, p, JSON.stringify(input.value)],
      );
    }
    return metadata(db, e, p);
  });
  await libraryChanged(e, [result]);
  return c.json(result);
});
domain.post("/ensembles/:ensemble/reorder", async (c) => {
  const input = reorderInput.parse(await c.req.json()),
    e = c.req.param("ensemble"),
    u = c.get("user");
  const results = await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "editPieces");
    const all = (
      await db.query("select id from music_pieces where ensemble_id=$1", [e])
    ).rows.map((r) => r.id);
    if (
      new Set(input.pieceIds).size !== all.length ||
      input.pieceIds.length !== all.length ||
      input.pieceIds.some((id) => !all.includes(id))
    )
      throw new DomainError("not_found", 404);
    for (const [n, id] of input.pieceIds.entries())
      await db.query(
        "update music_pieces set sort_key=$1,revision=revision+1 where id=$2 and ensemble_id=$3",
        [String(n).padStart(12, "0"), id, e],
      );
    await audit(db, e, u.id, "piece.reorder", e);
    return (
      await db.query(
        metadataSQL + " where p.ensemble_id=$1 order by p.sort_key",
        [e],
      )
    ).rows;
  });
  await libraryChanged(e, results);
  return c.json(results);
});
domain.delete("/ensembles/:ensemble/pieces/:piece", async (c) => {
  const e = c.req.param("ensemble"),
    p = c.req.param("piece"),
    u = c.get("user");
  const old = await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "editPieces");
    const old = await metadata(db, e, p);
    await db.query(
      "update music_pieces set current_version_id=null where id=$1",
      [p],
    );
    await db.query(
      "delete from score_versions where piece_id=$1 and ensemble_id=$2",
      [p, e],
    );
    await db.query(
      "update transcription_jobs set imported_piece_id=null where imported_piece_id=$1 and ensemble_id=$2",
      [p, e],
    );
    await db.query("delete from music_pieces where id=$1 and ensemble_id=$2", [
      p,
      e,
    ]);
    await audit(db, e, u.id, "piece.delete", p);
    return old;
  });
  await libraryChanged(e, [
    {
      pieceId: p,
      revision: old.revision + 1,
      versionNo: old.versionNo,
      contentHash: old.contentHash,
      deleted: true,
    },
  ]);
  return c.json({ status: true });
});
