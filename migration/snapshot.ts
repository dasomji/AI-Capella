import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
export const hash = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
export function canonical(v: any): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
export type Row = { id: string; path: string; data: Record<string, any> };
export type Snapshot = { manifest: any; collections: Record<string, Row[]> };
export const collections = [
  "ensembles",
  "songs",
  "ensembleCodes",
  "leaderCodes",
  "members",
  "leaders",
  "sessions",
  "feedback",
  "config",
];
export function encode(v: any): any {
  if (Buffer.isBuffer(v) || v instanceof Uint8Array)
    return { $bytes: Buffer.from(v).toString("base64") };
  if (v?.toDate) return { $timestamp: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, encode(x)]),
    );
  return v;
}
export async function writeSnapshot(
  out: string,
  project: string,
  data: Record<string, Row[]>,
  startedAt: string,
  readTime: string | null,
  inventory: {
    skippedCounts?: Record<string, number>;
    unknownCollections?: string[];
  } = {},
) {
  await mkdir(out, { recursive: true, mode: 0o700 });
  const files: any = {};
  for (const [name, rows] of Object.entries(data)) {
    const body =
      rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
    await writeFile(join(out, name + ".jsonl"), body, {
      mode: 0o600,
      flag: "wx",
    });
    files[name] = {
      count: rows.length,
      sha256: hash(body),
      bytes: Buffer.byteLength(body),
    };
  }
  const manifest = {
    version: 1,
    project,
    startedAt,
    endedAt: new Date().toISOString(),
    readTime,
    complete: true,
    ...inventory,
    files,
  };
  await writeFile(
    join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600, flag: "wx" },
  );
  return manifest;
}
export async function readSnapshot(dir: string): Promise<Snapshot> {
  const manifest = JSON.parse(
    await readFile(join(dir, "manifest.json"), "utf8"),
  );
  if (manifest.version !== 1 || !manifest.complete || !manifest.project)
    throw Error("Incomplete snapshot");
  for (const field of ["startedAt", "endedAt"])
    if (
      !/Z$/.test(manifest[field]) ||
      !Number.isFinite(Date.parse(manifest[field]))
    )
      throw Error("Snapshot instant requires Z");
  const data: Record<string, Row[]> = {};
  for (const name of collections) {
    const meta = manifest.files[name];
    if (!meta) {
      if (
        !["ensembles", "songs"].includes(name) &&
        Number.isSafeInteger(manifest.skippedCounts?.[name])
      ) {
        data[name] = [];
        continue;
      }
      throw Error("Missing collection " + name);
    }
    const body = await readFile(join(dir, name + ".jsonl"), "utf8");
    if (hash(body) !== meta.sha256 || Buffer.byteLength(body) !== meta.bytes)
      throw Error("Snapshot checksum mismatch " + name);
    const rows = body.trim()
      ? body
          .trim()
          .split("\n")
          .map((x) => JSON.parse(x))
      : [];
    if (
      rows.length !== meta.count ||
      new Set(rows.map((r) => r.path)).size !== rows.length
    )
      throw Error("Snapshot count/identity mismatch");
    data[name] = rows;
  }
  return { manifest, collections: data };
}
