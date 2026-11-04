import {
  backupDb,
  backupObjects,
  disposable,
  verify,
  digest,
} from "./ops-backup.mjs";
import { mkdir, writeFile, readFile, copyFile, cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import pg from "pg";
import assert from "node:assert/strict";
const dir = `.review-evidence/backup-${Date.now()}`;
await mkdir(dir, { recursive: true });
const source = await disposable();
let db;
try {
  Object.assign(process.env, source.env);
  assert.equal(spawnSync(process.execPath, ['--import','tsx','scripts/ops-canary.ts','--s3'], {env:{...process.env,...source.env},stdio:'inherit'}).status,0);
  assert.equal(
    spawnSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], {
      stdio: "inherit",
    }).status,
    0,
  );
  db = new pg.Client({ connectionString: source.env.DATABASE_URL });
  await db.connect();
  const raw = await readFile(
    "eval/fixtures/simple/reference.musicxml",
    "utf8",
  ).catch(() => null);
  const xml =
    raw ??
    '<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>';
  await db.query("begin");
  await db.query(
    "insert into \"user\"(id,name,email,email_verified) values('backup-user','Fixture','backup@example.test',true)",
  );
  await db.query(
    "insert into ensembles(id,name) values('backup-ensemble','Restore fixture')",
  );
  await db.query(
    "insert into memberships(ensemble_id,user_id,is_lead) values('backup-ensemble','backup-user',true)",
  );
  await db.query("commit");
  await db.query("begin");
  await db.query(
    "insert into music_pieces(id,ensemble_id,title,sort_key,format,current_version_id) values('backup-piece','backup-ensemble','Restore score','1','musicxml','backup-version')",
  );
  await db.query(
    "insert into score_versions(id,ensemble_id,piece_id,version_no,format,musicxml,content_hash,size) values('backup-version','backup-ensemble','backup-piece',1,'musicxml',$1,$2,$3)",
    [
      xml,
      createHash("sha256").update(xml).digest("hex"),
      Buffer.byteLength(xml),
    ],
  );
  await db.query("commit");
  const body = Buffer.from("retained original fixture"),
    hash = createHash("sha256").update(body).digest("hex");
  await source.client.send(
    new PutObjectCommand({
      Bucket: "restore",
      Key: "original/fixture",
      Body: body,
    }),
  );
  await db.query(
    "insert into stored_objects(ensemble_id,kind,object_key,size,content_type,sha256,provenance,state) values('backup-ensemble','original','original/fixture',$1,'application/pdf',$2,'{}','ready')",
    [body.length, hash],
  );
  console.log("Backup: fixture and object written");
  await source.client.send(
    new PutObjectCommand({
      Bucket: "restore",
      Key: "orphan-evidence",
      Body: Buffer.from("orphan"),
    }),
  );
  await db.query("insert into stored_objects(ensemble_id,kind,object_key,size,content_type,sha256,provenance,state) values('backup-ensemble','original','pending/fixture',1,'application/pdf',repeat('0',64),'{}','pending'),('backup-ensemble','original','failed/fixture',1,'application/pdf',repeat('0',64),'{}','failed')");
  const originalDump = await backupDb(dir),
    originalObjects = await backupObjects(`${dir}/objects`);
  await mkdir(`${dir}/download`);
  const dump = `${dir}/download/database.dump`,
    objects = `${dir}/download/objects`;
  await copyFile(originalDump, dump);
  await copyFile(originalDump + ".manifest.json", dump + ".manifest.json");
  await cp(originalObjects, objects, { recursive: true });
  assert.deepEqual(await digest(dump), await digest(originalDump));
  const report = await verify(dump, objects);
  assert.equal(report.parsedPieces, 1);
  assert.equal(report.counts.objects, "3");
  assert.deepEqual(report.nonReady.map(row => row.state).sort(), ["failed","pending"]);
  const manifest = JSON.parse(await readFile(dump + ".manifest.json", "utf8"));
  assert.ok(Date.parse(manifest.captureStartedAt) <= Date.parse(manifest.capturedAt));
  assert.deepEqual(report.orphans, ["orphan-evidence"]);
  const retained = await source.client.send(
    new GetObjectCommand({ Bucket: "restore", Key: "original/fixture" }),
  );
  assert.equal(await retained.Body.transformToString(), body.toString());
  await writeFile(`${objects}/data/0`, "corrupt");
  await assert.rejects(verify(dump, objects), /manifest mismatch/);
  await writeFile(`${objects}/data/0`, body);
  await db.query("update stored_objects set sha256=repeat('0',64)");
  const bad = await backupDb(`${dir}/bad`);
  await assert.rejects(verify(bad, objects), /stored object/);
  await writeFile(dump, Buffer.from("corrupt"));
  await assert.rejects(verify(dump, objects), /manifest mismatch/);
  console.log(
    "Backup rehearsal passed: full restore, parsed piece, object bytes, corruption and DB-reference mismatch rejection.",
  );
} finally {
  await db?.end();
  source.close();
}
