import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { io } from "socket.io-client";
import pg from "pg";
import { disposable } from "./ops-backup.mjs";
const fixture = await disposable();
let web, db, socket;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const portServer = createServer();
  await new Promise((r) => portServer.listen(0, "127.0.0.1", r));
  const port = portServer.address().port;
  await new Promise((r) => portServer.close(r));
  const base = `http://localhost:${port}`;
  Object.assign(process.env, fixture.env, {
    NODE_ENV: "test",
    MAIL_TRANSPORT: "capture",
    BETTER_AUTH_SECRET: "ops-fixture-at-least-32-characters-secret",
    BETTER_AUTH_URL: base,
    TRUSTED_ORIGINS: base,
    PORT: String(port),
  });
  assert.equal(
    spawnSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], {
      stdio: "inherit",
    }).status,
    0,
  );
  db = new pg.Client({ connectionString: fixture.env.DATABASE_URL });
  await db.connect();
  web = spawn(process.execPath, ["--import", "tsx", "server/entry.ts"], {
    env: process.env,
    stdio: "inherit",
  });
  for (let n = 0; ; n++) {
    try {
      if ((await fetch(base + "/readyz/rehearsal")).ok) break;
    } catch {}
    if (n > 200) throw Error("Web readiness timeout");
    await wait(100);
  }
  const post = (path, body) =>
    fetch(base + "/api/auth/" + path, {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const email = "shutdown@example.test",
    password = "shutdown-fixture-password-42";
  assert.ok((await post("sign-up/email", { email, password, name: "Ops" })).ok);
  await db.query('update "user" set email_verified=true where email=$1', [
    email,
  ]);
  const login = await post("sign-in/email", { email, password });
  assert.ok(login.ok);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  socket = io(base + "/rehearsal", {
    transports: ["websocket"],
    extraHeaders: { cookie, origin: base },
    reconnection: false,
  });
  await once(socket, "connect");
  const hint = once(socket, "server:restarting");
  const exit = once(web, "exit");
  web.kill("SIGTERM");
  const [data] = await hint;
  assert.equal(data.reconnectAfterMs, 2000);
  assert.equal((await exit)[0], 0);
  assert.equal(
    (await db.query("select pg_try_advisory_lock(714083,1) locked")).rows[0]
      .locked,
    true,
  );
  await db.query("select pg_advisory_unlock(714083,1)");
  // A real fenced page is abandoned at its checkpoint on stop, with no fresh claim.
  const user = (await db.query('select id from "user" where email=$1', [email]))
    .rows[0].id;
  await db.query("begin");
  await db.query("insert into ensembles(id,name) values('ops-e','Ops')");
  await db.query(
    "insert into memberships(ensemble_id,user_id,is_lead,ai_transcription) values('ops-e',$1,true,true)",
    [user],
  );
  await db.query("commit");
  await db.query(
    "insert into stored_objects(id,ensemble_id,object_key,size,sha256,content_type,provenance,state) values('ops-o','ops-e','unused',1,repeat('0',64),'application/pdf','{}','ready')",
  );
  await db.query(
    "insert into transcription_jobs(id,ensemble_id,started_by,model,prompt_version) values('ops-j','ops-e',$1,'fake-transcription-v1','fake-prompt-v1')",
    [user],
  );
  await db.query(
    "insert into job_pages(id,ensemble_id,job_id,object_id,page_number,model,prompt_version) values('ops-p','ops-e','ops-j','ops-o',1,'fake-transcription-v1','fake-prompt-v1')",
  );
  const { TranscriptionWorker } =
    await import("../server/transcription.server.ts");
  const { FakeProvider } =
    await import("../server/transcription-provider.server.ts");
  const worker = new TranscriptionWorker(
    new FakeProvider(() => "success", 30000),
  );
  const tick = worker.tick();
  for (let i = 0; ; i++) {
    if (
      (
        await db.query(
          "select 1 from provider_calls where job_id='ops-j' and outcome='running'",
        )
      ).rowCount
    )
      break;
    if (i > 100) throw Error("Provider start timeout");
    await wait(50);
  }
  worker.stop();
  await tick;
  const page = (
    await db.query("select state,lease_owner from job_pages where id='ops-p'")
  ).rows[0];
  assert.equal(page.state, "queued");
  assert.equal(page.lease_owner, null);
  assert.equal(await worker.tick(), false);
  await (await import("../server/db/index.server.ts")).pool.end();
  await db.query(
    "insert into transcription_control(id,paused) values(1,true) on conflict(id) do update set paused=true",
  );
  const processWorker = spawn(
    process.execPath,
    ["--import", "tsx", "server/transcription-worker.ts"],
    { env: process.env, stdio: ["ignore", "pipe", "inherit"] },
  );
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Worker startup timeout")),
        10000,
      );
      processWorker.stdout.on("data", (data) => {
        if (data.toString().includes("worker.ready")) {
          clearTimeout(timer);
          resolve();
        }
      });
      processWorker.once("exit", (code) => {
        clearTimeout(timer);
        reject(Error("Worker exited before ready: " + code));
      });
    });
    const stopped = once(processWorker, "exit");
    processWorker.kill("SIGTERM");
    assert.equal((await stopped)[0], 0);
  } finally {
    if (processWorker.exitCode === null) processWorker.kill("SIGTERM");
  }
  console.log(
    "Graceful operations passed: web SIGTERM reconnect hint, clean exit/owner release; active worker stop requeues/relinquishes lease and refuses claims.",
  );
} finally {
  socket?.close();
  if (web?.exitCode === null) {
    const exit = once(web, "exit");
    web.kill("SIGTERM");
    await exit;
  }
  await db?.end();
  fixture.close();
}
