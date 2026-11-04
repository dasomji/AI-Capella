import { gunzipSync } from "node:zlib";
import { settingsInput, ensembleInput } from "../src/api/domain";
import { pieceTitle, cleanTitle, truncateTitle } from "../src/api/title";
import { validateScore } from "../server/score-validation.server";
import { env } from "../server/env.server";
import { canonical, hash, type Row } from "./snapshot";
export { ensembleInput };
const defaultNames: Record<string, string> = {
  nnb: "Ensemble n.n.b.",
  rm: "Relativ männlich",
  frederick: "Frederick",
  suv: "Stolz und Vorurteil",
};
export function safeLabel(value: unknown, fallback: string) {
  const cleaned =
    typeof value === "string"
      ? truncateTitle(cleanTitle(value.toWellFormed().replace(/\0/g, "")))
      : "";
  return cleaned || truncateTitle(fallback);
}
export function ensembleName(id: string, data: any, displayName?: string) {
  const source =
    typeof data.name === "string" && data.name.trim()
      ? data.name
      : (defaultNames[id] ?? displayName ?? id);
  const name = safeLabel(source, id);
  return { name, changed: source !== data.name || name !== source };
}
export function legacyOrder(row: Row) {
  return typeof row.data.sortKey === "number" &&
    Number.isFinite(row.data.sortKey)
    ? row.data.sortKey
    : typeof row.data.importedAt === "number" &&
        Number.isFinite(row.data.importedAt)
      ? row.data.importedAt
      : 0;
}
export const transientValidation = (error: any) =>
  ["validation_busy", "validation_timeout"].includes(
    error?.code ?? error?.message,
  );
export async function validateWithRetry(
  raw: string,
  format: "score" | "musicxml",
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await validateScore(raw, format, true);
    } catch (error) {
      if (!transientValidation(error) || attempt === 2) throw error;
      await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
    }
  }
}
function compactImages(v: any): any {
  if (typeof v === "string") return v.toWellFormed().replace(/\0/g, "");
  if (Array.isArray(v)) return v.map(compactImages);
  if (v && typeof v === "object") {
    if (typeof v.$bytes === "string") {
      const b = Buffer.from(v.$bytes, "base64");
      return { sha256: hash(b), bytes: b.length };
    }
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, compactImages(x)]),
    );
  }
  return v;
}
export async function prepare(row: Row) {
  const d = row.data;
  const original = d.xmlGz
    ? Buffer.from(d.xmlGz.$bytes, "base64")
    : Buffer.from(d.xml ?? "");
  const raw = d.xmlGz
    ? gunzipSync(original, { maxOutputLength: env.SCORE_MAX_BYTES }).toString(
        "utf8",
      )
    : d.xml;
  if (typeof raw !== "string" || Buffer.byteLength(raw) > env.SCORE_MAX_BYTES)
    throw Error("Invalid/oversized body");
  const format = d.format ?? "musicxml";
  if (!["musicxml", "score"].includes(format)) throw Error("Unknown format");
  const validated = await validateWithRetry(raw, format);
  const title = pieceTitle.parse(
    safeLabel(d.title, "Unbenanntes Stück (" + row.id + ")"),
  );
  const titleChanged = title !== d.title;
  const settings: any = {
    part_names: null,
    clef_overrides: null,
    removed_parts: null,
    split_parts: null,
    swing: false,
    saved_config: null,
    format_defaults: null,
  };
  const unmapped: string[] = [];
  const set = (
    op: string,
    key: string | undefined,
    value: any,
    column: string,
  ) => {
    const parsed = settingsInput.safeParse({ op, key, value });
    if (!parsed.success) {
      unmapped.push(op + "." + (key ?? ""));
      return;
    }
    if (op === "swing") settings.swing = value;
    else {
      settings[column] ??= {};
      settings[column][key!] = value;
    }
  };
  for (const [field, op, col] of [
    ["partNameOverrides", "partName", "part_names"],
    ["clefOverrides", "clef", "clef_overrides"],
    ["savedConfig", "saved", "saved_config"],
  ] as const)
    if (d[field])
      for (const [k, v] of Object.entries(d[field])) set(op, k, v, col);
  for (const [field, op, col] of [
    ["removedParts", "removed", "removed_parts"],
    ["splitParts", "split", "split_parts"],
  ] as const)
    if (d[field]) {
      if (!Array.isArray(d[field])) unmapped.push(field);
      else for (const k of d[field]) set(op, k, true, col);
    }
  if (d.swing !== undefined) set("swing", undefined, d.swing, "swing");
  if (d.percussion !== undefined)
    set("defaults", "percussion", d.percussion, "format_defaults");
  const known = [
    "title",
    "xml",
    "xmlGz",
    "format",
    "ensemble",
    "sortKey",
    "importedAt",
    "createdAt",
    "partNameOverrides",
    "clefOverrides",
    "savedConfig",
    "removedParts",
    "splitParts",
    "swing",
    "percussion",
  ];
  for (const k of Object.keys(d)) if (!known.includes(k)) unmapped.push(k);
  return {
    row,
    raw,
    format: format as "musicxml" | "score",
    title,
    titleChanged,
    validated,
    settings,
    unmapped,
    contentHash: hash(canonical(d)),
    scoreHash: validated.hash,
    provenance: {
      legacy_id: row.id,
      original_bytes_sha256: hash(original),
      raw_body: validated.raw !== raw ? raw : undefined,
      legacy_settings: compactImages(
        Object.fromEntries(
          Object.entries(d).filter(([k]) => !["xml", "xmlGz"].includes(k)),
        ),
      ),
      unmapped,
    },
  };
}
