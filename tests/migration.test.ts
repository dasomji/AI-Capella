import { test, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { initializeApp, deleteApp } from "firebase-admin/app";
import {
  getFirestore,
  DocumentReference,
  WriteBatch,
  Transaction,
} from "firebase-admin/firestore";
import { exportSnapshot } from "../scripts/migrate-legacy/export";
import { readSnapshot, canonical, hash } from "../migration/snapshot";
import { importSnapshot } from "../migration/import";
import { reconcile, notation } from "../migration/reconcile";
import { pool } from "../server/db/index.server";
import { server, io } from "../server/start";
import { captureMail } from "../server/mail.server";
const root = process.env.MIGRATION_TEST_ROOT!;
const app = initializeApp({ projectId: "demo-migration" }, "seed");
const db = getFirestore(app);
after(async () => {
  await deleteApp(app);
  await new Promise<void>((r) => io.close(() => r()));
  server.close();
  await pool.end();
});
const xml =
  '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note></measure></part></score-partwise>';
async function snapshot(n: string) {
  await exportSnapshot({ project: "demo-migration", out: root + "/" + n });
  return readSnapshot(root + "/" + n);
}
async function firestoreState() {
  const data: any = {};
  for (const c of [
    "ensembles",
    "songs",
    "ensembleCodes",
    "leaderCodes",
    "sessions",
    "members",
    "leaders",
  ])
    data[c] = (await db.collection(c).get()).docs.map((d) => [d.id, d.data()]);
  return hash(canonical(data));
}
async function request(path: string, body: any, cookie = "") {
  return fetch(process.env.BETTER_AUTH_URL + "/api/" + path, {
    method: "POST",
    headers: {
      origin: process.env.BETTER_AUTH_URL!,
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
async function account(email: string) {
  const password = "migration-test-password-42";
  let r = await request("auth/sign-up/email", {
    email,
    password,
    name: "Migration Singer",
  });
  assert.equal(r.status, 200, await r.clone().text());
  for (
    let n = 0;
    n < 200 && !captureMail.messages.some((m) => m.to === email);
    n++
  )
    await new Promise((r) => setTimeout(r, 10));
  const link = captureMail.messages
    .find((m) => m.to === email)!
    .text.match(/https?:\/\/\S+/)![0];
  r = await request("auth/verify-email-password", {
    token: new URL(link).searchParams.get("token"),
    password,
  });
  assert.equal(r.status, 200, await r.clone().text());
  r = await request("auth/sign-in/email", { email, password });
  assert.equal(r.status, 200);
  return r.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
}
test(
  "emulator export → dry-run/import/reconcile → delta/conflicts/deletion → verified lead → downloaded rollback",
  { timeout: 180000 },
  async (t) => {
    for (const id of ["nnb", "rm", "suv"])
      await db
        .doc("ensembles/" + id)
        .set({ codeId: "legacy-code", leaderCodeId: "legacy-lead" });
    const settings = {
      partNameOverrides: { P1: "Renamed" },
      clefOverrides: { P1: "treble8" },
      percussion: { P1: false },
      removedParts: ["unused"],
      splitParts: ["P1"],
      swing: true,
      savedConfig: {
        transpose: 2,
        bpm: 123,
        sections: [{ label: "A", beat: 0 }],
        played: true,
      },
      scanMarks: [{ m: 1, note: "review", img: Buffer.from("synthetic") }],
    };
    await db.doc("songs/plain").set({
      ensemble: "nnb",
      title: " Invisible\u200b title ",
      xml,
      sortKey: -42,
      ...settings,
    });
    const large = xml.replace(
      "<part-list>",
      "<!--" + "synthetic-padding ".repeat(70000) + "--><part-list>",
    );
    assert.ok(Buffer.byteLength(large) > 900000);
    await db.doc("songs/gzip").set({
      ensemble: "nnb",
      title: "Compressed",
      xmlGz: gzipSync(large),
      format: "musicxml",
      sortKey: 0.0001,
    });
    const native = {
      title: "Native",
      parts: [{ id: "P1", name: "Voice" }],
      notes: [
        {
          partId: "P1",
          midi: 60,
          startBeat: 0,
          durationBeats: 4,
          measureNumber: 1,
        },
      ],
      measures: [{ number: 1, startBeat: 0, beats: 4, beatType: 4, fifths: 0 }],
      slurs: [],
      totalBeats: 4,
      rehearsalMarks: [],
    };
    await db.doc("songs/native").set({
      ensemble: "rm",
      title: "Native",
      xml: JSON.stringify(native),
      format: "score",
      importedAt: 100,
    });
    await db
      .doc("songs/unmapped")
      .set({ ensemble: "suv", title: "Awaiting", xml, sortKey: 7 });
    await db.doc("songs/orphan").set({ title: "Orphan", xml });
    await db
      .doc("songs/unknown")
      .set({ ensemble: "unknown", title: "Unknown", xml });
    await db
      .doc("songs/broken")
      .set({ ensemble: "nnb", title: "Broken", xmlGz: Buffer.from("broken") });
    await db
      .doc("songs/public")
      .set({ ensemble: "public", title: "Sample", xml });
    await db.doc("sessions/live").set({ playing: true, songId: "plain" });
    await db.doc("sessions/clockPing_uid").set({ clientTime: 123 });
    for (const c of ["ensembleCodes", "leaderCodes"])
      await db.doc(c + "/code").set({ ensemble: "nnb" });
    for (const c of ["members", "leaders"])
      await db
        .doc(c + "/anonymous/ensembles/nnb")
        .set({ code: "code", joinedAt: 1 });
    const original = await firestoreState();
    let writes = 0;
    const spies = [
      ...[DocumentReference, WriteBatch, Transaction].flatMap((c) =>
        ["set", "update", "delete", "create", "commit"]
          .filter((k) => typeof (c.prototype as any)[k] === "function")
          .map((k) =>
            mock.method(c.prototype as any, k, () => {
              writes++;
              throw Error("Firestore write attempted");
            }),
          ),
      ),
    ];
    t.after(() => {
      for (const spy of spies) spy.mock.restore();
    });
    const s = await snapshot("first");
    assert.equal(s.manifest.skippedCounts.members, 1);
    assert.equal(s.manifest.skippedCounts.leaders, 1);
    assert.equal(s.collections.members.length, 0);
    // Use 6b's backup implementation when present, retaining a downloaded binary archive.
    const backup = root + "/pre-import.dump";
    const container = process.env.MIGRATION_TEST_CONTAINER!;
    const capturedAt = new Date().toISOString();
    const dumped = spawnSync(
      "docker",
      [
        "exec",
        "-e",
        "PGHOST=/var/run/postgresql",
        "-e",
        "PGCONNECT_TIMEOUT=5",
        container,
        "pg_dump",
        "-w",
        "-U",
        "postgres",
        "-d",
        "fixture",
        "-Fc",
        "-f",
        "/tmp/pre-import.dump",
      ],
      { timeout: 60000 },
    );
    assert.equal(dumped.status, 0, dumped.stderr.toString());
    const serverHash = spawnSync(
      "docker",
      ["exec", container, "sha256sum", "/tmp/pre-import.dump"],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(serverHash.status, 0);
    const serverSize = spawnSync(
      "docker",
      ["exec", container, "stat", "-c", "%s", "/tmp/pre-import.dump"],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(serverSize.status, 0);
    const copied = spawnSync(
      "docker",
      ["cp", container + ":/tmp/pre-import.dump", backup],
      { timeout: 10000 },
    );
    assert.equal(copied.status, 0);
    const downloaded = await readFile(backup);
    const info = { size: downloaded.length, sha256: hash(downloaded) };
    assert.equal(serverHash.stdout.split(" ")[0], info.sha256);
    assert.equal(Number(serverSize.stdout.trim()), info.size);
    await writeFile(
      backup + ".manifest.json",
      JSON.stringify({ capturedAt, ...info }),
    );
    const mapping = {
      nnb: { emails: ["lead@example.test"] },
      rm: { emails: ["other-lead@example.test"] },
    };
    let r = await importSnapshot(s, mapping, { dryRun: true });
    assert.equal(
      (await pool.query("select count(*)::int as n from ensembles")).rows[0].n,
      0,
    );
    assert.ok(r.items.some((i) => i.status === "malformed"));
    assert.ok(r.invitations.every((i) => !i.url));
    r = await importSnapshot(s, mapping);
    assert.equal(
      r.items.filter((i) => i.status === "created").length,
      4,
      JSON.stringify(r),
    );
    assert.equal(
      (await pool.query("select count(*)::int as n from memberships")).rows[0]
        .n,
      0,
    );
    assert.equal((await reconcile(s)).mismatches, 0);
    const cli = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/migrate-legacy/run.ts",
        "reconcile",
        "--snapshot",
        root + "/first",
        "--report",
        root + "/cli-reconcile",
      ],
      { encoding: "utf8" },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(
      JSON.parse(await readFile(root + "/cli-reconcile.json", "utf8"))
        .mismatches,
      0,
    );
    const firstInv = r.invitations.find((i) => i.email === "lead@example.test");
    const token = firstInv.url.split("/").at(-1);
    r = await importSnapshot(s, mapping);
    assert.equal(r.items.filter((i) => i.status === "unchanged").length, 4);
    assert.equal(r.invitations.length, 0);
    assert.equal(
      (await pool.query("select count(*)::int as n from score_versions"))
        .rows[0].n,
      4,
    );
    assert.equal(
      await firestoreState(),
      original,
      "import/reconcile did not modify Firestore",
    );
    assert.equal(writes, 0);
    for (const spy of spies) spy.mock.restore();
    const piece = (
      await pool.query(
        "select p.*,v.musicxml,v.timing from music_pieces p join score_versions v on v.id=p.current_version_id where p.title='Invisible title'",
      )
    ).rows[0];
    assert.equal(notation(piece.musicxml, "musicxml").notes, 1);
    assert.equal(piece.timing.totalBeats, 4);
    assert.deepEqual(piece.part_names, { P1: "Renamed" });
    assert.deepEqual(piece.provenance.legacy_settings.scanMarks[0].img, {
      sha256: hash(Buffer.from("synthetic")),
      bytes: 9,
    });
    // Vite handles the PDF module's font URL imports; execute the app's actual headless prep.
    const { createServer } = await import("vite");
    const vite = await createServer({
      configFile: false,
      server: { middlewareMode: true },
    });
    try {
      const { prepareXml } = await vite.ssrLoadModule("/src/exportPdf.ts");
      const { JSDOM } = await import("jsdom");
      const dom = new JSDOM("");
      globalThis.DOMParser = dom.window.DOMParser;
      globalThis.XMLSerializer = dom.window.XMLSerializer;
      const pdf = prepareXml({
        xml: piece.musicxml,
        title: piece.title,
        semitones: 2,
        voices: [{ id: "P1", name: "Renamed", include: true }],
      });
      assert.ok(pdf.includes("Renamed"));
      dom.window.close();
    } finally {
      await vite.close();
    }
    const wrong = await account("wrong@example.test");
    assert.equal(
      (await request("invitations/" + token + "/accept", {}, wrong)).status,
      403,
    );
    const lead = await account("lead@example.test");
    const accepted = await request(
      "invitations/" + token + "/accept",
      {},
      lead,
    );
    assert.equal(accepted.status, 200, await accepted.clone().text());
    assert.equal((await accepted.json()).isLead, true);
    const pending = (
      await pool.query(
        "select * from invitations where email='other-lead@example.test' and state='pending'",
      )
    ).rows[0];
    await pool.query(
      'insert into memberships(ensemble_id,user_id,is_lead) select $1,id,true from "user" where email=$2',
      [pending.ensemble_id, "lead@example.test"],
    );
    for (const [path, body] of [
      [
        `ensembles/${pending.ensemble_id}/invitations`,
        { email: pending.email, idempotencyKey: "migration-create-guard" },
      ],
      [
        `ensembles/${pending.ensemble_id}/invitations/${pending.id}/resend`,
        { idempotencyKey: "migration-resend-guard" },
      ],
    ] as const) {
      const guarded = await request(path, body, lead);
      assert.equal(guarded.status, 409, await guarded.clone().text());
      assert.ok((await guarded.text()).includes("migration_invitation"));
    }
    await db.doc("ensembles/rm").update({ name: "Renamed legacy choir" });
    await db
      .doc("songs/plain")
      .update({ xml: xml.replace("<step>C", "<step>D") });
    const delta = await snapshot("delta");
    r = await importSnapshot(delta, mapping);
    assert.ok(r.items.some((i) => i.id === "plain" && i.status === "updated"));
    assert.equal(
      (
        await pool.query(
          "select count(*)::int as n from score_versions where piece_id=$1",
          [piece.id],
        )
      ).rows[0].n,
      2,
    );
    assert.equal((await reconcile(delta)).mismatches, 0);
    assert.equal(
      (
        await pool.query(
          "select name from ensembles where id=(select entity_id from legacy_import_map where collection='ensembles' and legacy_id='rm')",
        )
      ).rows[0].name,
      "Renamed legacy choir",
    );
    await pool.query(
      "update music_pieces set title='New system edit',revision=revision+1 where id=$1",
      [piece.id],
    );
    await db.doc("songs/plain").update({ title: "Legacy edit" });
    r = await importSnapshot(await snapshot("conflict"), mapping);
    assert.ok(r.items.some((i) => i.id === "plain" && i.status === "conflict"));
    assert.equal(
      (
        await pool.query("select title from music_pieces where id=$1", [
          piece.id,
        ])
      ).rows[0].title,
      "New system edit",
    );
    await db.doc("songs/native").delete();
    const deleted = await snapshot("deleted");
    r = await importSnapshot(deleted, mapping);
    assert.ok(
      r.items.some(
        (i) =>
          i.id === "native" && i.status === "deleted_in_legacy" && !i.applied,
      ),
    );
    assert.ok((await reconcile(deleted)).mismatches > 0);
    r = await importSnapshot(deleted, mapping, { applyDeletions: true });
    assert.ok(r.items.some((i) => i.id === "native" && i.applied));
    assert.equal(
      (
        await pool.query(
          "select count(*)::int as n from legacy_import_map where collection='songs' and legacy_id='native'",
        )
      ).rows[0].n,
      0,
    );
    const sent = await importSnapshot(deleted, mapping, {
      sendInvitations: true,
    });
    assert.ok(sent.invitations.some((i) => i.status === "sent"));
    assert.ok(
      captureMail.messages.some(
        (m) =>
          m.to === "other-lead@example.test" &&
          m.subject.includes("lead invitation"),
      ),
    );
    const stateBeforeRollback = await firestoreState();
    const restored = spawnSync(
      process.execPath,
      [
        "scripts/migrate-legacy/rollback.mjs",
        "--container",
        process.env.MIGRATION_TEST_CONTAINER!,
        "--backup",
        backup,
        "--sha256",
        info.sha256,
        "--bytes",
        String(info.size),
      ],
      { encoding: "utf8" },
    );
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(
      (await pool.query("select count(*)::int as n from music_pieces")).rows[0]
        .n,
      0,
    );
    assert.ok((await reconcile(s)).mismatches > 0);
    assert.equal(await firestoreState(), stateBeforeRollback);
    assert.equal(
      (await pool.query('select count(*)::int as n from "user"')).rows[0].n,
      0,
    );
    // Corrupt files cannot be imported and read-only export requires explicit production opt-in.
    await writeFile(root + "/first/songs.jsonl", "corrupt");
    await assert.rejects(readSnapshot(root + "/first"), /checksum/);
    const emulator = process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    try {
      await assert.rejects(
        exportSnapshot({
          project: "not-a-real-project",
          out: root + "/refused",
        }),
        /understand/,
      );
    } finally {
      process.env.FIRESTORE_EMULATOR_HOST = emulator;
    }
    await writeFile(
      root + "/result.json",
      JSON.stringify({
        passed: true,
        completedAt: new Date().toISOString(),
        scenarios: [
          "dry-run",
          "idempotence",
          "reconcile",
          "large gzip",
          "native",
          "settings",
          "PDF prep",
          "lead acceptance",
          "delta",
          "conflict",
          "deletion",
          "rollback",
          "Firestore unchanged",
        ],
      }),
    );
  },
);

// Each regression owns fresh destination rows; failures do not hide later review cases.
async function fixture(ids = ["nnb"]) {
  await pool.query("truncate ensembles,legacy_import_map cascade");
  const { collections } = await import("../migration/snapshot");
  const data = Object.fromEntries(collections.map((c) => [c, []])) as any;
  data.ensembles = ids.map((id) => ({
    id,
    path: "ensembles/" + id,
    data: { codeId: "legacy-secret" },
  }));
  data.songs = ids.map((id, index) => ({
    id: "piece-" + index,
    path: "songs/piece-" + index,
    data: { ensemble: id, title: "Piece", xml },
  }));
  return {
    manifest: {
      project: "demo-migration",
      startedAt: new Date().toISOString(),
      unknownCollections: ["surprise"],
    },
    collections: data,
  };
}
const leadMapping = { nnb: { emails: ["regression@example.test"] } };
async function pieceRow() {
  return (
    await pool.query(
      "select p.*,v.size from music_pieces p join score_versions v on v.id=p.current_version_id limit 1",
    )
  ).rows[0];
}
async function cliSnapshot(s: any, label: string) {
  const { writeSnapshot } = await import("../migration/snapshot");
  const dir = root + "/" + label;
  await writeSnapshot(
    dir,
    s.manifest.project,
    s.collections,
    new Date().toISOString(),
    null,
  );
  await writeFile(dir + "/mapping.json", JSON.stringify(leadMapping));
  return dir;
}
function cli(
  dir: string,
  report: string,
  extra: string[] = [],
  extraEnv: any = {},
) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/migrate-legacy/run.ts",
      "import",
      "--snapshot",
      dir,
      "--mapping",
      dir + "/mapping.json",
      "--report",
      report,
      ...extra,
    ],
    { encoding: "utf8", env: { ...process.env, ...extraEnv } },
  );
}

test("1: historical defaults, reviewed names, sanitized/truncated names and titles", async () => {
  const s = await fixture([
    "nnb",
    "rm",
    "frederick",
    "suv",
    "custom",
    "fallback",
    "long",
  ]);
  s.collections.ensembles.at(-1)!.data.name = "x".repeat(220);
  s.collections.songs[0].data.title = "\u200b";
  s.collections.songs[1].data.title = "a".repeat(250);
  s.collections.songs[2].data.title = "\0\ud800";
  const r = await importSnapshot(s, {
    custom: { emails: ["c@example.test"], displayName: "Custom" },
  });
  assert.ok(
    !r.items.some((i) => i.status === "ensemble_failed"),
    JSON.stringify(r),
  );
  const names = (await pool.query("select name from ensembles")).rows.map(
    (r) => r.name,
  );
  for (const name of [
    "Ensemble n.n.b.",
    "Relativ männlich",
    "Frederick",
    "Stolz und Vorurteil",
    "Custom",
    "fallback",
    "x".repeat(200),
  ])
    assert.ok(names.includes(name), name);
  assert.equal(r.items.filter((i) => i.titleChanged).length, 3);
  assert.equal(
    r.items.filter((i) => i.status === "ensemble_name_substituted").length,
    7,
  );
});

test("2: CLI refuses either occupied report before DB writes; crash preserves committed links; mapping required", async () => {
  const s = await fixture(["nnb", "rm"]);
  const dir = await cliSnapshot(s, "cli-import");
  for (const suffix of [".json", ".md"]) {
    const report = dir + "/occupied" + suffix;
    await writeFile(report + suffix, "keep");
    const result = cli(dir, report);
    assert.notEqual(result.status, 0);
    assert.equal(
      (await pool.query("select count(*)::int n from ensembles")).rows[0].n,
      0,
    );
    assert.equal(await readFile(report + suffix, "utf8"), "keep");
  }
  const crashed = cli(dir, dir + "/crash", [], {
    MIGRATION_CRASH_AFTER_ENSEMBLES: "1",
  });
  assert.equal(crashed.status, 86, crashed.stderr);
  const report = JSON.parse(await readFile(dir + "/crash.json", "utf8"));
  assert.ok(report.invitations[0].url);
  assert.equal(report.invitations[0].status, "not_sent");
  assert.equal(
    (await pool.query("select count(*)::int n from ensembles")).rows[0].n,
    1,
  );
  const { stat } = await import("node:fs/promises");
  assert.equal((await stat(dir + "/crash.json")).mode & 0o777, 0o600);
  const rerun = cli(dir, dir + "/rerun");
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.equal(
    (await pool.query("select count(*)::int n from ensembles")).rows[0].n,
    2,
  );
  const invalid = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/migrate-legacy/run.ts",
      "import",
      "--snapshot",
      dir,
      "--mapping",
      dir + "/missing",
      "--report",
      dir + "/bad",
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(invalid.status, 0);
});

for (const mutation of [
  "truncated_xml",
  "format",
  "size",
  "timing",
  "settings",
  "title",
  "order",
])
  test("3/8: reconcile reports " + mutation + " without crashing", async () => {
    const s = await fixture();
    await importSnapshot(s, {});
    const p = await pieceRow();
    if (mutation === "truncated_xml")
      await pool.query(
        "update score_versions set musicxml='<score-partwise>' where id=$1",
        [p.current_version_id],
      );
    if (mutation === "format")
      await pool.query("update music_pieces set format='score' where id=$1", [
        p.id,
      ]);
    if (mutation === "size")
      await pool.query("update score_versions set size=size+1 where id=$1", [
        p.current_version_id,
      ]);
    if (mutation === "timing")
      await pool.query("update score_versions set timing='{}' where id=$1", [
        p.current_version_id,
      ]);
    if (mutation === "settings")
      await pool.query("update music_pieces set swing=true where id=$1", [
        p.id,
      ]);
    if (mutation === "title")
      await pool.query("update music_pieces set title='Changed' where id=$1", [
        p.id,
      ]);
    if (mutation === "order") {
      s.collections.songs.push({
        id: "second",
        path: "songs/second",
        data: { ensemble: "nnb", title: "Second", xml, sortKey: 1 },
      });
      await importSnapshot(s, {});
      await pool.query(
        "update music_pieces set sort_key='999999999999' where id=$1",
        [p.id],
      );
    }
    const r = await reconcile(s);
    assert.ok(r.mismatches > 0, JSON.stringify(r));
  });

test("4: revoke respected; expiry reported; explicit reissue/rotation and failed mail retain links", async () => {
  const s = await fixture();
  await importSnapshot(s, leadMapping);
  await pool.query("update invitations set state='revoked',revoked_at=now()");
  let r = await importSnapshot(s, leadMapping, { sendInvitations: true });
  assert.ok(r.items.some((i) => i.status === "revoked_invitation_skipped"));
  assert.equal(r.invitations.length, 0);
  r = await importSnapshot(s, leadMapping, { reissueRevoked: true });
  assert.equal(r.invitations.length, 1);
  await pool.query(
    "update invitations set expires_at=now()-interval '1 day' where state='pending'",
  );
  r = await importSnapshot(s, leadMapping);
  assert.ok(r.items.some((i) => i.status === "expired_invitation"));
  assert.equal(r.invitations.length, 0);
  r = await importSnapshot(s, leadMapping, { rotateInvitations: true });
  assert.ok(r.invitations[0].url);
  assert.equal(r.invitations[0].status, "not_sent");
  const { mailer } = await import("../server/mail.server");
  const spy = mock.method(mailer, "send", async () => {
    throw Error("test unavailable");
  });
  try {
    r = await importSnapshot(s, leadMapping, { sendInvitations: true });
    assert.equal(r.invitations[0].status, "delivery_failed");
    assert.ok(r.invitations[0].url);
  } finally {
    spy.mock.restore();
  }
});

test("5: member invitation conflict retains ensemble song delta", async () => {
  const s = await fixture();
  await importSnapshot(s, {});
  const e = (await pool.query("select id from ensembles")).rows[0].id;
  await pool.query(
    "insert into invitations(ensemble_id,email,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",
    [e, "regression@example.test", hash("member")],
  );
  s.collections.songs[0].data.xml = xml.replace("<step>C", "<step>D");
  const r = await importSnapshot(s, leadMapping, { sendInvitations: true });
  assert.ok(r.items.some((i) => i.status === "member_invitation_conflict"));
  assert.ok(r.items.some((i) => i.status === "updated"));
  assert.equal((await reconcile(s)).mismatches, 0);
});

test("6/7/9: project guard, minimal export, unknown inventory and emulator permission probe", async () => {
  const s = await fixture();
  await importSnapshot(s, {});
  const other = structuredClone(s);
  other.manifest.project = "demo-other";
  await assert.rejects(importSnapshot(other, {}), /Different source project/);
  assert.ok(
    (
      await importSnapshot(other, {}, { allowSourceProjectChange: true })
    ).items.some((i) => i.status === "source_project_change"),
  );
  await assert.rejects(
    exportSnapshot({ project: "random-project", out: root + "/unsafe" }),
    /demo-/,
  );
  const credentials = root + "/fake-credentials.json";
  await writeFile(credentials, JSON.stringify({ project_id: "different" }));
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  try {
    await assert.rejects(
      exportSnapshot({
        project: "target",
        credentials,
        out: root + "/mismatch",
        productionAcknowledged: true,
      }),
      /project_id/,
    );
  } finally {
    process.env.FIRESTORE_EMULATOR_HOST = emulator;
  }
  await db.doc("surprise/private").set({ secret: "must not export" });
  const exported = await snapshot("minimal");
  assert.ok(exported.manifest.unknownCollections.includes("surprise"));
  assert.ok(exported.manifest.skippedCounts.sessions > 0);
  assert.ok(!exported.manifest.files.sessions);
  assert.ok(!("codeId" in exported.collections.ensembles[0].data));
  const permissions = await exportSnapshot({
    project: "demo-migration",
    checkPermissions: true,
  });
  assert.equal((permissions as any).readAccess, true);
  assert.equal((permissions as any).writePermissions, null);
});

test("8: numeric-only sort keys and Firestore mixed-case byte ordering", async () => {
  const s = await fixture();
  s.collections.songs = ["a", "Z", "B", "b"].map((id) => ({
    id,
    path: "songs/" + id,
    data: { ensemble: "nnb", title: id, xml, sortKey: "abc", importedAt: 5 },
  }));
  await importSnapshot(s, {});
  const r = await reconcile(s);
  assert.equal(r.mismatches, 0);
  assert.deepEqual(
    r.items.find((i) => i.status === "ensemble_match").expectedOrder,
    ["B", "Z", "a", "b"],
  );
});

test("nice: settings delta avoids versions; native numeric keys remain appendable; removed mapping findings", async () => {
  const s = await fixture();
  await importSnapshot(s, {});
  const p = await pieceRow();
  await pool.query(
    "insert into music_pieces(ensemble_id,title,sort_key,format) values($1,'Native','000000000010','musicxml')",
    [p.ensemble_id],
  );
  s.collections.songs[0].data.swing = true;
  const r = await importSnapshot(s, {
    missing: { emails: ["missing@example.test"] },
  });
  assert.equal(
    (await pool.query("select count(*)::int n from score_versions")).rows[0].n,
    1,
  );
  assert.equal((await pieceRow()).swing, true);
  assert.equal(
    (await pool.query("select sort_key from music_pieces where id=$1", [p.id]))
      .rows[0].sort_key,
    "000000000011",
  );
  assert.ok(r.items.some((i) => i.status === "mapping_without_ensemble"));
  const removed = await importSnapshot(
    { ...s, collections: { ...s.collections, ensembles: [] } },
    {},
  );
  assert.ok(
    removed.items.some((i) => i.status === "ensemble_deleted_in_legacy"),
  );
});

test("10: bounded gzip bomb is quarantined", async () => {
  const s = await fixture();
  const { env } = await import("../server/env.server");
  s.collections.songs[0].data.xmlGz = {
    $bytes: gzipSync(Buffer.alloc(env.SCORE_MAX_BYTES + 1, 65)).toString(
      "base64",
    ),
  };
  const r = await importSnapshot(s, {});
  assert.ok(r.items.some((i) => i.status === "malformed"));
  assert.equal(
    (await pool.query("select count(*)::int n from music_pieces")).rows[0].n,
    0,
  );
});

test("nice: database rejects unmarked lead grants", async () => {
  const s = await fixture();
  await importSnapshot(s, {});
  const p = await pieceRow();
  await assert.rejects(
    pool.query(
      "insert into invitations(ensemble_id,email,kind,token_hash,expires_at) values($1,'unmarked@example.test','lead',$2,now())",
      [p.ensemble_id, hash("unmarked")],
    ),
    /invitation_lead_migration_check/,
  );
});
