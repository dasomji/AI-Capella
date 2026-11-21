import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createTestContainers } from "./test-containers.mjs";
let restartServer;
const fixtures = await createTestContainers();
async function port() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
async function run(args, env) {
  const c = spawn(process.execPath, args, { env, stdio: ["inherit","inherit","inherit","ipc"] });
  c.on("message", async m=>{if(m.type==="restart"){try{await restartServer();c.send({type:"restarted"});}catch(e){c.send({error:String(e)});}}});
  fixtures.trackChild(c);
  const code = await new Promise((r) => c.on("exit", r));
  if (code !== 0) throw Error(`Command failed (${code}): ${args.join(" ")}`);
}
try {
  const dbPort = Number(process.env.BROWSER_DB_PORT) || (await port()),
    smtpPort = Number(process.env.BROWSER_SMTP_PORT) || (await port()),
    mailPort = Number(process.env.BROWSER_MAIL_PORT) || (await port()),
    appPort = Number(process.env.BROWSER_PORT) || (await port());
  const db = `aicap-browser-db-${process.pid}`,
    mail = `aicap-browser-mail-${process.pid}`;
  await fixtures.run([
    "-d",
    "--name",
    db,
    "-e",
    "POSTGRES_PASSWORD=fixture-only",
    "-e",
    "POSTGRES_DB=fixture",
    "-p",
    `127.0.0.1:${dbPort}:5432`,
    "postgres:17-alpine",
  ]);
  await fixtures.run([
    "-d",
    "--name",
    mail,
    "-p",
    `127.0.0.1:${smtpPort}:1025`,
    "-p",
    `127.0.0.1:${mailPort}:8025`,
    "axllent/mailpit:v1.27",
  ]);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (
      spawnSync("docker", ["exec", db, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"])
        .status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw Error("Database did not start");
  const base = `http://localhost:${appPort}`,
    env = {
      ...process.env,
      NODE_ENV: "test",
      LIGHTSCORE_BUILD_ROOT: process.env.LIGHTSCORE_BUILD_ROOT || `${process.cwd()}/.review-evidence/browser-build-${process.pid}`,
      DATABASE_URL: `postgres://postgres:fixture-only@127.0.0.1:${dbPort}/fixture`,
      BETTER_AUTH_SECRET: "isolated-browser-fixture-secret-32-characters",
      BETTER_AUTH_URL: base,
      TRUSTED_ORIGINS: base,
      PORT: String(appPort),
      MAIL_TRANSPORT: "smtp",
      SMTP_URL: `smtp://127.0.0.1:${smtpPort}`,
      BROWSER_BASE: base,
      MAILPIT_URL: `http://127.0.0.1:${mailPort}`,
      BROWSER_EVIDENCE:
        process.env.BROWSER_EVIDENCE ||
        `${process.cwd()}/.review-evidence/browser`,
    };
  await run(["--import", "tsx", "scripts/migrate.ts"], env);
  await run(["node_modules/vite/bin/vite.js", "build"], env);
  let server = spawn(
    process.execPath,
    ["--import", "tsx", "server/entry.ts"],
    { env, stdio: "inherit" },
  );
  fixtures.trackChild(server);
  ready = false;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(base + "/readyz")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw Error("Server did not start");
  restartServer=async()=>{
    server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));
    server=spawn(process.execPath,["--import","tsx","server/entry.ts"],{env,stdio:"inherit"});fixtures.trackChild(server);
    for(let i=0;i<150;i++){try{if((await fetch(base+'/readyz')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
    throw Error('Restart readiness timeout');
  };
  if (!process.env.CHROMIUM_PATH && !existsSync(chromium.executablePath())) {
    env.PLAYWRIGHT_BROWSERS_PATH = `${process.cwd()}/.review-evidence/browsers`;
    await run(["node_modules/playwright/cli.js", "install", "chromium"], env);
  }
  if (!process.env.BROWSER_SCRIPT) {
    await run(["scripts/browser-player-regressions.mjs"], env);
    await run(["scripts/browser-owner-decisions.mjs"], env);
    await run(["scripts/browser-review-routes.mjs"], env);
    await run(["scripts/browser-power-hint.mjs"], env);
  }
  await run([process.env.BROWSER_SCRIPT || "scripts/browser-phase2b.mjs"], env);
  if(!process.env.BROWSER_SCRIPT) {await run(["scripts/browser-phase5a.mjs"],env);await run(["scripts/browser-sync.mjs"],env);await run(["scripts/browser-sync-acceptance.mjs"],env);}
} finally {
  await fixtures.close();
}
