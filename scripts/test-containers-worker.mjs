import { spawnSync } from "node:child_process";
import { fixtureLabel } from "./test-containers.mjs";

const run = process.argv[2];
if (!run || !process.send) throw Error("Start fixture watchers through createTestContainers()");
const label = `${fixtureLabel}=${run}`;
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 180000 });
  if (result.status !== 0) throw Error(`Docker ${args[0]} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}
function cleanup() {
  // Ownership labels also find a container if its creation succeeded but the
  // Docker CLI returned an error. Never remove by name or use a global prune.
  const ids = docker(["ps", "-aq", "--filter", `label=${label}`]).split(/\s+/).filter(Boolean);
  const errors = [];
  for (const id of ids) {
    try { docker(["rm", "-fv", id]); }
    catch (error) {
      // --rm may remove a stopped container between listing and removal.
      if (docker(["ps", "-aq", "--filter", `id=${id}`, "--filter", `label=${label}`])) errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, "Could not remove test fixtures");
}
function shutdown() {
  try { cleanup(); process.exit(0); }
  catch (error) { console.error(error); process.exit(1); }
}
function reply(message) {
  if (process.connected) process.send(message, error => { if (error) shutdown(); });
}
process.on("disconnect", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("message", ({ id, action, args }) => {
  try {
    let value;
    if (action === "run") value = docker(["run", "--rm", "--restart=no", "--label", label, ...args]);
    else if (action === "close") cleanup();
    else if (action !== "ready") throw Error(`Unknown fixture action: ${action}`);
    reply({ id, value });
  } catch (error) {
    reply({ id, error: String(error) });
  }
});
