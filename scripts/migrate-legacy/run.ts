import { parseArgs } from "node:util";
import { readFile, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { readSnapshot } from "../../migration/snapshot";
import { importSnapshot, mappingSchema } from "../../migration/import";
import { reconcile } from "../../migration/reconcile";
import { pool } from "../../server/db/index.server";
const { values: v, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    snapshot: { type: "string" },
    mapping: { type: "string" },
    "dry-run": { type: "boolean" },
    "send-invitations": { type: "boolean" },
    "rotate-invitations": { type: "boolean" },
    "reissue-revoked": { type: "boolean" },
    "allow-source-project-change": { type: "boolean" },
    "apply-deletions": { type: "boolean" },
    report: { type: "string" },
  },
});
try {
  if (!v.snapshot) throw Error("--snapshot required");
  const mode = positionals[0];
  if (!["import", "reconcile"].includes(mode)) throw Error("Unknown command");
  const snapshot = await readSnapshot(v.snapshot);
  const mapping =
    mode === "import"
      ? mappingSchema.parse(JSON.parse(await readFile(v.mapping!, "utf8")))
      : {};
  const path = v.report ?? `${v.snapshot}/${mode}-${Date.now()}`;
  // Reserve BOTH destinations exclusively before the first database query.
  const json = await open(path + ".json", "wx", 0o600);
  await json.close();
  try {
    const md = await open(path + ".md", "wx", 0o600);
    await md.close();
  } catch (error) {
    await unlink(path + ".json");
    throw error;
  }
  let checkpoints = 0;
  const checkpoint = async (report: any) => {
    const temp = path + `.${process.pid}.tmp`;
    const file = await open(temp, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(report, null, 2));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temp, path + ".json");
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    // Explicit test-only crash boundary, after durable report and ensemble commit.
    if (
      !report.invitations.some((i: any) => i.status === "commit_unconfirmed") &&
      process.env.NODE_ENV === "test" &&
      process.env.MIGRATION_CRASH_AFTER_ENSEMBLES &&
      ++checkpoints === Number(process.env.MIGRATION_CRASH_AFTER_ENSEMBLES)
    )
      process.exit(86);
  };
  const report =
    mode === "import"
      ? await importSnapshot(snapshot, mapping, {
          dryRun: v["dry-run"],
          sendInvitations: v["send-invitations"],
          rotateInvitations: v["rotate-invitations"],
          reissueRevoked: v["reissue-revoked"],
          allowSourceProjectChange: v["allow-source-project-change"],
          applyDeletions: v["apply-deletions"],
          checkpoint,
        })
      : await reconcile(snapshot);
  await checkpoint(report);
  const markdown = await open(path + ".md", "r+");
  try {
    await markdown.writeFile(
      `# Migration ${mode}\n\nUTC: ${report.at}; business time: ${report.businessTime} (${report.timeZone})\n\n` +
        report.items.map((i: any) => "- " + JSON.stringify(i)).join("\n"),
    );
    await markdown.sync();
  } finally {
    await markdown.close();
  }
  console.log(path + ".json");
  if (
    ("mismatches" in report && report.mismatches) ||
    report.items.some((i: any) =>
      [
        "ensemble_failed",
        "conflict",
        "deletion_conflict",
        "transient_validation_failed",
      ].includes(i.status),
    )
  )
    process.exitCode = 1;
} finally {
  await pool.end();
}
