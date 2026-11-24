import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createTestContainers, fixtureLabel } from "./test-containers.mjs";
import { disposable } from "./ops-backup.mjs";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}
const inspect = name => JSON.parse(docker(["inspect", name]))[0];
async function until(check) {
  for (let n = 0; n < 150; n++) {
    if (check()) return;
    await delay(100);
  }
  assert.fail("Fixture cleanup did not finish within 15 seconds");
}
const runnerSource = `
  import { createTestContainers } from ${JSON.stringify(new URL("./test-containers.mjs", import.meta.url).href)};
  const fixtures = await createTestContainers();
  await fixtures.run(['--rm=' + process.env.AUTO_REMOVE, '-d', '--name', process.env.FIXTURE_NAME, 'postgres:17-alpine', 'sh', '-c', 'sleep 300']);
  process.on('message', async mode => {
    if (mode === 'failure') throw Error('Deliberate runner failure');
    await fixtures.close();
    process.disconnect();
  });
  process.send('ready');
`;

for (const mode of ["normal", "failure", "SIGINT", "SIGTERM", "SIGKILL", "SIGKILL-restartable"]) {
  test(`removes containers and anonymous volumes after ${mode}`, { timeout: 180000 }, async t => {
    const name = `aicap-cleanup-test-${randomUUID()}`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", runnerSource], {
      env: { ...process.env, FIXTURE_NAME: name, AUTO_REMOVE: mode.endsWith("-restartable") ? "false" : "true" },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let stderr = "";
    child.stderr.on("data", bytes => { stderr += bytes; });
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      // Emergency test teardown targets only this test's UUID-named container.
      spawnSync("docker", ["rm", "-fv", name], { stdio: "ignore", timeout: 30000 });
    });
    const exited = once(child, "exit");
    const ready = await Promise.race([
      once(child, "message").then(([message]) => message),
      exited.then(() => { throw Error(`Runner exited before fixture creation: ${stderr}`); }),
    ]);
    assert.equal(ready, "ready");
    const container = inspect(name);
    const volumes = container.Mounts.filter(m => m.Type === "volume").map(m => m.Name);
    assert.ok(volumes.length, "Use an image with anonymous volumes to exercise disk cleanup");
    assert.equal(container.HostConfig.AutoRemove, !mode.endsWith("-restartable"));
    assert.equal(container.HostConfig.RestartPolicy.Name, "no");
    assert.ok(container.Config.Labels[fixtureLabel]);
    if (mode.startsWith("SIG")) child.kill(mode.split("-")[0]);
    else child.send(mode);
    const [code, signal] = await exited;
    if (mode === "normal") assert.equal(code, 0, stderr);
    if (mode === "failure") assert.notEqual(code, 0);
    if (mode === "SIGINT") assert.equal(code, 130, stderr);
    if (mode === "SIGTERM") assert.equal(code, 143, stderr);
    if (mode.startsWith("SIGKILL")) assert.equal(signal, "SIGKILL");
    await until(() => !docker(["ps", "-aq", "--filter", `name=^/${name}$`]));
    await until(() => {
      const remaining = new Set(docker(["volume", "ls", "-q"]).split("\n"));
      return volumes.every(volume => !remaining.has(volume));
    });
  });
}

test("outage fixtures retain data across stop/start and remove it on scope close", { timeout: 180000 }, async () => {
  const fixtures = await createTestContainers();
  const name = `aicap-cleanup-restart-${randomUUID()}`;
  let volumes;
  try {
    await fixtures.run(["--rm=false", "-d", "--name", name, "postgres:17-alpine", "sh", "-c", "sleep 300"]);
    volumes = inspect(name).Mounts.filter(m => m.Type === "volume").map(m => m.Name);
    docker(["exec", name, "sh", "-c", "printf fixture > /var/lib/postgresql/data/sentinel"]);
    docker(["stop", "-t", "1", name]);
    assert.equal(inspect(name).State.Running, false);
    docker(["start", name]);
    assert.equal(docker(["exec", name, "cat", "/var/lib/postgresql/data/sentinel"]), "fixture");
  } finally {
    await fixtures.close();
  }
  assert.equal(docker(["ps", "-aq", "--filter", `name=^/${name}$`]), "");
  const remaining = new Set(docker(["volume", "ls", "-q"]).split("\n"));
  assert.ok(volumes.every(volume => !remaining.has(volume)));
});

test("a failed launch cannot delete another run's container", { timeout: 180000 }, async () => {
  const owner = await createTestContainers(), other = await createTestContainers();
  const name = `aicap-cleanup-owner-${randomUUID()}`;
  const partial = `aicap-cleanup-partial-${randomUUID()}`;
  try {
    await owner.run(["-d", "--name", name, "postgres:17-alpine", "sh", "-c", "sleep 300"]);
    await other.run(["-d", "--name", partial, "postgres:17-alpine", "sh", "-c", "sleep 300"]);
    const volumes = inspect(partial).Mounts.filter(m => m.Type === "volume").map(m => m.Name);
    await assert.rejects(other.run(["-d", "--name", name, "postgres:17-alpine"]), /already in use/);
    await other.close();
    assert.equal(docker(["ps", "-aq", "--filter", `name=^/${partial}$`]), "");
    const remaining = new Set(docker(["volume", "ls", "-q"]).split("\n"));
    assert.ok(volumes.every(volume => !remaining.has(volume)), "Remove volumes from partial setup");
    assert.equal(inspect(name).State.Running, true);
  } finally {
    await Promise.all([owner.close(), other.close()]);
  }
});

test("real S3 writes use one small, non-preallocated file per bucket", { timeout: 180000 }, async () => {
  const fixture = await disposable();
  try {
    await fixture.client.send(new CreateBucketCommand({ Bucket: "allocation-check" }));
    await fixture.client.send(new PutObjectCommand({ Bucket: "allocation-check", Key: "test", Body: "small object" }));
    const store = fixture.db.replace(/-db$/, "-s3");
    const files = docker(["exec", store, "sh", "-c",
      'for f in /data/*.dat; do stat -c "%n %b %s" "$f"; done']).split("\n").map(line => {
        const [name, blocks, bytes] = line.split(" ");
        return { name, allocated: Number(blocks) * 512, bytes: Number(bytes) };
      });
    assert.equal(files.filter(f => f.name.includes("allocation-check_")).length, 1, JSON.stringify(files));
    assert.ok(files.every(f => f.allocated < 8 * 1024 * 1024), JSON.stringify(files));
    console.log("SeaweedFS allocation:", files);
  } finally {
    fixture.client.destroy();
    await fixture.close();
  }
});
