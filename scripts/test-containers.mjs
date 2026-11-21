// A separate process owns Docker fixtures. IPC disconnect still cleans them up
// when the test runner is SIGKILLed, without depending on a finally block.
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";

export const fixtureLabel = "com.lightscore.test-run";

export async function createTestContainers() {
  const worker = fork(new URL("./test-containers-worker.mjs", import.meta.url),
    [randomUUID()], { detached: true, stdio: ["ignore", "ignore", "inherit", "ipc"], execArgv: [] });
  const pending = new Map(), children = new Set();
  let serial = 0, closing, exited = false;
  const exit = new Promise(resolve => worker.once("exit", code => {
    exited = true;
    for (const { reject } of pending.values()) reject(Error(`Fixture watcher exited (${code})`));
    pending.clear();
    resolve(code);
  }));
  worker.on("error", error => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  });
  worker.on("message", ({ id, value, error }) => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    error ? request.reject(Error(error)) : request.resolve(value);
    if (!pending.size) { worker.unref(); worker.channel?.unref(); }
  });
  function request(action, args) {
    if (exited || !worker.connected) return Promise.reject(Error("Fixture watcher is unavailable"));
    worker.ref();
    worker.channel.ref();
    const id = ++serial;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.send({ id, action, args }, error => {
        if (error) { pending.delete(id); reject(error); }
      });
    });
  }
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      for (const [signal, handler] of handlers) process.off(signal, handler);
      await Promise.all([...children].map(async child => {
        if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
        const stopped = new Promise(resolve => child.once("exit", resolve));
        child.kill("SIGTERM");
        const deadline = setTimeout(() => child.kill("SIGKILL"), 5000);
        try { await stopped; } finally { clearTimeout(deadline); }
      }));
      try { await request("close"); }
      finally {
        worker.ref();
        if (worker.connected) worker.disconnect();
        const code = await exit;
        if (code !== 0) throw Error(`Fixture cleanup failed (${code})`);
      }
    })();
    return closing;
  }
  const handlers = ["SIGINT", "SIGTERM"].map(signal => {
    const handler = () => {
      close().then(() => process.exit(signal === "SIGINT" ? 130 : 143), error => {
        console.error(error);
        process.exit(1);
      });
    };
    process.on(signal, handler);
    return [signal, handler];
  });
  try { await request("ready"); }
  catch (error) { await close(); throw error; }
  return {
    run(args) {
      if (closing) throw Error("Fixture scope is closing");
      return request("run", args);
    },
    trackChild(child) { children.add(child); return child; },
    close,
  };
}
