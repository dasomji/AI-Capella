import { sandboxReady } from "./sandbox.server";
if (!(await sandboxReady())) {
  console.error(
    JSON.stringify({
      event: "worker.sandbox_unavailable",
      at: new Date().toISOString(),
    }),
  );
  process.exit(1);
}
import {
  TranscriptionWorker,
  maintainTranscription,
} from "./transcription.server";
import { pool } from "./db/index.server";
import { env } from "./env.server";
import { storage } from "./storage.server";
import { cleanupObjects } from "./originals.server";
import { logError } from "./logger.server";
if (env.NODE_ENV === "development") await storage().initialize();
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    worker.stop();
    const deadline = setTimeout(() => process.exit(1), 20000);
    deadline.unref();
  });
const worker = new TranscriptionWorker();
console.log(
  JSON.stringify({
    event: "worker.ready",
    timestamp: new Date().toISOString(),
  }),
);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function slot() {
  while (!stopping) {
    try {
      if (!(await worker.tick())) await delay(500);
    } catch (error) {
      logError("transcription.worker", error);
      await delay(1000);
    }
  }
}
async function maintenance() {
  while (!stopping) {
    await maintainTranscription(worker, cleanupObjects);
    await delay(1000);
  }
}
try {
  await Promise.all([
    maintenance(),
    ...Array.from({ length: env.TRANSCRIPTION_WORKER_CONCURRENCY }, () =>
      slot(),
    ),
  ]);
} finally {
  await pool.end();
}
