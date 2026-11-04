import { sandboxReady } from "../server/sandbox.server";
import { spawnSync } from "node:child_process";
const sandbox = await sandboxReady();
const poppler = spawnSync("pdftoppm", ["-v"], { stdio: "ignore" }).status === 0;
console.log(
  JSON.stringify({
    at: new Date().toISOString(),
    sandbox,
    poppler,
    uploads: sandbox && poppler,
  }),
);
if (!sandbox || !poppler) process.exitCode = 1;
