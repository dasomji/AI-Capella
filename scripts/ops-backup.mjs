// Database client uses Docker so operators need no host pg_dump version matching.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pipeline } from "node:stream/promises";
import pg from "pg";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
export function command(args, options = {}) {
  const r = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 180000,
    ...options,
  });
  if (r.status !== 0)
    throw Error(`Docker ${args[0]} failed: ${r.error?.message ?? r.stderr}`);
  return r.stdout?.trim();
}
export async function digest(file) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { size, sha256: hash.digest("hex") };
}
export const s3 = (env = process.env) => {
  for (const key of [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ])
    if (!env[key]) throw Error(`${key} is required`);
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    requestHandler: { requestTimeout: 15000, connectionTimeout: 5000 },
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
};
export async function backupDb(dir) {
  if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = join(
    dir,
    `database-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`,
  );
  const { closeSync } = await import("node:fs");
  const { openSync } = await import("node:fs");
  const fd = openSync(file, "wx", 0o600);
  try {
    command(
      [
        "run",
        "--rm",
        "--network",
        "host",
        "-e",
        "PGDATABASE",
        "-e",
        "PGCONNECT_TIMEOUT=5",
        "postgres:17-alpine",
        "sh",
        "-c",
        'exec pg_dump -d "$PGDATABASE" -w -Fc --no-owner --no-acl',
      ],
      {
        env: { ...process.env, PGDATABASE: process.env.DATABASE_URL },
        stdio: ["ignore", fd, "pipe"],
      },
    );
  } finally {
    closeSync(fd);
  }
  await writeFile(
    file + ".manifest.json",
    JSON.stringify(
      {
        version: 1,
        capturedAt: new Date().toISOString(),
        ...(await digest(file)),
      },
      null,
      2,
    ),
  );
  return file;
}
export async function backupObjects(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await mkdir(join(dir, "data"));
  const client = s3(),
    Bucket = process.env.S3_BUCKET,
    objects = [];
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket, ContinuationToken: token }),
    );
    for (const item of page.Contents ?? []) {
      const file = `data/${objects.length}`;
      const response = await client.send(
        new GetObjectCommand({ Bucket, Key: item.Key }),
      );
      await pipeline(
        response.Body,
        createWriteStream(join(dir, file), { flags: "wx", mode: 0o600 }),
      );
      const info = await digest(join(dir, file));
      if (info.size !== Number(item.Size))
        throw Error("Object changed during backup; quiesce writes and repeat");
      objects.push({ key: item.Key, file, ...info });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify(
      { version: 1, capturedAt: new Date().toISOString(), objects },
      null,
      2,
    ),
  );
  return dir;
}
export async function disposable() {
  const id = `aicap-restore-${randomUUID()}`,
    db = id + "-db",
    store = id + "-s3";
  const owned = [];
  try {
    command([
      "run",
      "-d",
      "--name",
      db,
      "-e",
      "POSTGRES_PASSWORD=fixture-only",
      "-e",
      "POSTGRES_DB=fixture",
      "-p",
      "127.0.0.1::5432",
      "postgres:17-alpine",
    ]);
    owned.push(db);
    command([
      "run",
      "-d",
      "--name",
      store,
      "-p",
      "127.0.0.1::8333",
      "chrislusf/seaweedfs:4.06",
      "server",
      "-dir=/data",
      "-master.volumeSizeLimitMB=64",
      "-s3",
    ]);
    owned.push(store);
    const port = (n) =>
      command(["port", n, n === db ? "5432" : "8333"])
        .split(":")
        .at(-1);
    const url = `postgres://postgres:fixture-only@127.0.0.1:${port(db)}/fixture`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (
        spawnSync("docker", ["exec", db, "pg_isready", "-U", "postgres"], {
          stdio: "ignore",
        }).status === 0
      ) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!ready) throw Error("Postgres readiness timeout");
    const env = {
      DATABASE_URL: url,
      S3_ENDPOINT: `http://127.0.0.1:${port(store)}`,
      S3_BUCKET: "restore",
      S3_ACCESS_KEY_ID: "fixture",
      S3_SECRET_ACCESS_KEY: "fixture",
    };
    const client = s3(env);
    for (let i = 0; ; i++) {
      try {
        await client.send(new CreateBucketCommand({ Bucket: "restore" }));
        break;
      } catch (e) {
        if (i === 99) throw e;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    return {
      db,
      env,
      client,
      close() {
        for (const n of owned.reverse()) command(["rm", "-fv", n]);
      },
    };
  } catch (e) {
    for (const n of owned.reverse()) command(["rm", "-fv", n]);
    throw e;
  }
}
export async function verify(dump, objects) {
  const savedEnv = { ...process.env };
  const expected = JSON.parse(await readFile(dump + ".manifest.json", "utf8"));
  const actual = await digest(dump);
  if (expected.size !== actual.size || expected.sha256 !== actual.sha256)
    throw Error("Database manifest mismatch");
  const manifest = JSON.parse(
    await readFile(join(objects, "manifest.json"), "utf8"),
  );
  const keys = new Set();
  for (const o of manifest.objects) {
    if (keys.has(o.key) || !/^data\/\d+$/.test(o.file))
      throw Error("Invalid object manifest");
    keys.add(o.key);
    const d = await digest(join(objects, o.file));
    if (d.size !== o.size || d.sha256 !== o.sha256)
      throw Error("Object manifest mismatch");
  }
  console.log("Restore: manifests verified; starting disposable services");
  const fixture = await disposable();
  let db;
  try {
    const fd = (await import("node:fs")).openSync(dump, "r");
    try {
      command(
        [
          "exec",
          "-i",
          "-e",
          "PGHOST=/var/run/postgresql",
          "-e",
          "PGCONNECT_TIMEOUT=5",
          fixture.db,
          "pg_restore",
          "-w",
          "-U",
          "postgres",
          "-d",
          "fixture",
          "--no-owner",
          "--no-acl",
          "--exit-on-error",
        ],
        { stdio: [fd, "pipe", "pipe"] },
      );
    } finally {
      (await import("node:fs")).closeSync(fd);
    }
    console.log("Restore: database restored; copying object bytes");
    for (const o of manifest.objects) {
      await fixture.client.send(
        new PutObjectCommand({
          Bucket: "restore",
          Key: o.key,
          Body: createReadStream(join(objects, o.file)),
          ContentLength: o.size,
        }),
      );
      const restored = await fixture.client.send(
        new GetObjectCommand({ Bucket: "restore", Key: o.key }),
      );
      const hash = createHash("sha256");
      let size = 0;
      for await (const c of restored.Body) {
        size += c.length;
        hash.update(c);
      }
      if (size !== o.size || hash.digest("hex") !== o.sha256)
        throw Error("Restored object mismatch");
    }
    db = new pg.Client({ connectionString: fixture.env.DATABASE_URL });
    await db.connect();
    const before = await db.query(
      "select hash from drizzle.__drizzle_migrations order by created_at",
    );
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/migrate.ts"],
      { env: { ...process.env, ...fixture.env }, stdio: "inherit" },
    );
    if (r.status !== 0) throw Error("Restored migration check failed");
    const after = await db.query(
      "select hash from drizzle.__drizzle_migrations order by created_at",
    );
    const { readMigrationFiles } = await import("drizzle-orm/migrator");
    const expectedHashes = readMigrationFiles({
      migrationsFolder: "./drizzle",
    }).map((m) => m.hash);
    if (
      JSON.stringify(after.rows.map((r) => r.hash)) !==
      JSON.stringify(expectedHashes)
    )
      throw Error("Restored migration hashes differ from committed migrations");
    if (JSON.stringify(before.rows) !== JSON.stringify(after.rows))
      throw Error(
        "Backup schema is not current: forward migration required; review separately",
      );
    const rows = (
      await db.query("select object_key,size,sha256,state from stored_objects")
    ).rows;
    const map = new Map(manifest.objects.map((o) => [o.key, o]));
    for (const row of rows) {
      const o = map.get(row.object_key);
      if (!o || o.size !== Number(row.size) || o.sha256 !== row.sha256)
        throw Error(`Missing/mismatched stored object (${row.state})`);
      map.delete(row.object_key);
    }
    const counts = (
      await db.query(
        'select (select count(*) from "user") users,(select count(*) from ensembles) ensembles,(select count(*) from music_pieces) pieces,(select count(*) from stored_objects) objects',
      )
    ).rows[0];
    // Use the application's parser/validator rather than accepting XML well-formedness alone.
    Object.assign(process.env, {
      NODE_ENV: "test",
      BETTER_AUTH_SECRET: "restore-fixture-secret-at-least-32-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
      TRUSTED_ORIGINS: "http://localhost:3000",
      ...fixture.env,
    });
    const { validateScore } =
      await import("../server/score-validation.server.ts");
    const pieces = (
      await db.query(
        "select v.format,v.musicxml,v.native_score from music_pieces p join score_versions v on v.id=p.current_version_id limit 10",
      )
    ).rows;
    for (const piece of pieces)
      await validateScore(
        piece.musicxml ?? JSON.stringify(piece.native_score),
        piece.format,
        true,
      );
    const report = {
      verifiedAt: new Date().toISOString(),
      counts,
      parsedPieces: pieces.length,
      orphans: [...map.keys()],
    };
    console.log(JSON.stringify(report, null, 2));
    return report;
  } finally {
    await db?.end();
    fixture.close();
    for (const key of Object.keys(process.env))
      if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
}
const action = process.argv[2];
if (action === "db")
  console.log(await backupDb(resolve(process.argv[3] ?? "backups")));
else if (action === "objects")
  console.log(
    await backupObjects(
      resolve(
        process.argv[3] ??
          `backups/objects-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      ),
    ),
  );
else if (action === "verify") {
  const arg = (n) => {
    const i = process.argv.indexOf(n);
    if (i < 0 || !process.argv[i + 1]) throw Error(`Required ${n}`);
    return resolve(process.argv[i + 1]);
  };
  await verify(arg("--db"), arg("--objects"));
}
