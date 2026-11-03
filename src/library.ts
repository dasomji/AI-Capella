import { unzipSync, strFromU8 } from "fflate";
import { api, ApiError } from "./domain-client";
import { localLibrary } from "./local-library";
import { activeEnsemble, canEditPieces, PUBLIC_ID } from "./ensembles";
import { io } from "socket.io-client";
import type { PieceMetadata } from "./api/domain";
export type SongFormat = "musicxml" | "score";

export interface StoredSong {
  id: string;
  contentHash?: string;
  title: string;
  // MusicXML markup when format is 'musicxml'; a JSON-serialized Score (see score.ts) when
  // format is 'score' -- MIDI imports go this route since MIDI notes are already plain numeric
  // pitches with no notation-level spelling to encode, so round-tripping them through MusicXML
  // text would only add a lossy, unnecessary conversion step.
  xml: string;
  format: SongFormat;
  importedAt: number;
  // Where it stands in the repertoire, when someone moved it there by hand (else by importedAt).
  sortKey?: number;
  // User-renamed voice/part names, keyed by part id -- a side-channel field rather than rewriting
  // the xml/xmlGz blob itself (far less invasive: no need to re-parse/re-serialize MusicXML or
  // mutate a JSON Score just to change a label). Applied client-side after parsing, before the
  // part name is shown anywhere. Absent/undefined for a song with no renamed voices.
  partNameOverrides?: Record<string, string>;
  // A deliberately-saved default for this song (the "Save" action in main.ts), applied when the
  // song is freshly selected -- not written automatically on every transpose/BPM/marker change,
  // only when the user explicitly asks to remember the current setup. sections is only ever
  // populated here for a song whose MusicXML has no <rehearsal> marks of its own (see
  // Score.rehearsalMarks) -- when it does, those are used directly and nothing needs saving.
  // played: the sections' beats count a piece's repeats as played (saved since repeats are played
  // out); older ones count each printed bar once (main.ts carries them over, score.ts playedBeat).
  savedConfig?: {
    transpose?: number;
    bpm?: number;
    sections?: { label: string; beat: number }[];
    played?: boolean;
  };
  // Per-voice clef chosen in the app (keyed by part id), overriding the file's own <clef>.
  clefOverrides?: Record<string, VoiceClef>;
  // Per voice (part id): played as percussion -- claps, stamps -- or not, chosen in the app; else
  // as percussion.ts recognises it.
  percussion?: Record<string, boolean>;
  // Voices removed in the app (part ids). The stored score itself is never rewritten, so a removed
  // voice can be restored at any time; it is filtered out when the song loads.
  removedParts?: string[];
  // Parts on several staves whose staves are voices of their own (part ids): a piano whose two
  // hands two people play. Otherwise such a part is one voice.
  splitParts?: string[];
  // Played with swing (swing.ts) instead of straight -- a choice for the song, for everyone.
  swing?: boolean;
  // A scanned song (scan.ts): the places the scan wasn't sure of, for the singers to check, until
  // someone says they're fine. img: a small JPEG of the bar on the scanned page.
  scanMarks?: ScanMark[];
}

export interface ScanMark {
  m: number; // the bar's position in the file
  measure: string; // its printed number
  part: string; // the voice's name, "" for all
  note: string;
  img?: Uint8Array;
}

export type VoiceClef = "treble" | "treble8" | "bass";

const metadata = new Map<string, PieceMetadata>();
const bodies = new Map<string, Promise<string>>();
let notify: (() => void) | undefined;
let stopSubscription: (() => void) | undefined;
const base = () => `/ensembles/${activeEnsemble()}/pieces`;
function stored(m: PieceMetadata): StoredSong {
  const s = m.settings as any;
  return {
    contentHash: m.contentHash,
    id: m.id,
    title: m.title,
    xml: "",
    format: m.format,
    importedAt: Date.parse(m.updatedAt),
    sortKey: Number(m.sortKey),
    partNameOverrides: s.partNames,
    clefOverrides: s.clefOverrides,
    removedParts: Object.keys(s.removedParts ?? {}).filter(
      (k) => s.removedParts[k],
    ),
    splitParts: Object.keys(s.splitParts ?? {}).filter((k) => s.splitParts[k]),
    swing: s.swing,
    percussion: s.formatDefaults?.percussion,
    savedConfig: s.savedConfig,
  };
}
export async function scoreBody(id: string): Promise<string> {
  let m = metadata.get(id);
  if (!m) {
    m = await api<PieceMetadata>(`${base()}/${id}`);
    metadata.set(id, m);
    notify?.();
  }
  let body = bodies.get(m.contentHash);
  if (!body) {
    body = fetch(
      `/api/ensembles/${m.ensembleId}/pieces/${id}/versions/${m.contentHash}`,
    ).then(async (r) => {
      if (!r.ok) throw new ApiError("not_found", r.status);
      const text = await r.text();
      return text;
    });
    bodies.set(m.contentHash, body);
    body.catch(() => bodies.delete(m!.contentHash));
  }
  return body;
}
export function clearLibrary() {
  const stop = stopSubscription;
  stopSubscription = undefined;
  stop?.();
  metadata.clear();
  bodies.clear();
  notify = undefined;
}
export function subscribeToSongs(
  callback: (songs: StoredSong[], fromCache: boolean) => void,
  onError: (e: unknown) => void,
  ensemble: string,
): () => void {
  clearLibrary();
  let closed = false;
  const emit = () => {
    if (!closed)
      callback(
        [...metadata.values()]
          .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
          .map(stored),
        false,
      );
  };
  notify = emit;
  const refresh = async () => {
    const rows = await api<PieceMetadata[]>(`/ensembles/${ensemble}/pieces`);
    if (closed) return;
    metadata.clear();
    rows.forEach((m) => metadata.set(m.id, m));
    emit();
  };
  const socket = io({ withCredentials: true, transports: ["websocket"] });
  socket.on("membership:changed", () =>
    window.dispatchEvent(new Event("membership:refresh")),
  );
  socket.on("connect", () => {
    socket.emit("ensemble:join", ensemble);
    void refresh().catch(onError);
  });
  socket.on("library:changed", async (event) => {
    if (event.ensembleId !== ensemble) return;
    try {
      await Promise.all(
        event.changes.map(async (c: any) => {
          if (c.deleted) metadata.delete(c.pieceId);
          else {
            const m = await api<PieceMetadata>(
              `/ensembles/${ensemble}/pieces/${c.pieceId}`,
            );
            if (!closed) metadata.set(m.id, m);
          }
        }),
      );
      emit();
    } catch (e) {
      onError(e);
    }
  });
  const rejoin = () => socket.emit("ensemble:join", ensemble);
  window.addEventListener("membership:changed", rejoin);
  void refresh().catch(onError);
  const stop = () => {
    closed = true;
    socket.disconnect();
    window.removeEventListener("membership:changed", rejoin);
  };
  stopSubscription = stop;
  return () => {
    if (stopSubscription === stop) clearLibrary();
    else stop();
  };
}
export const songOrder = (s: { sortKey?: number; importedAt: number }) =>
  s.sortKey ?? s.importedAt;
export async function saveSongOrder(places: { id: string; sortKey: number }[]) {
  await api(`/ensembles/${activeEnsemble()}/reorder`, "POST", {
    expectedOrder: [...metadata.values()]
      .sort(
        (a, b) =>
          a.sortKey.localeCompare(b.sortKey) || a.id.localeCompare(b.id),
      )
      .map((p) => p.id),
    pieceIds: [...places]
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((p) => p.id),
  });
}
export async function saveImportedSong(song: {
  title: string;
  xml: string;
  format: SongFormat;
  ensemble?: string;
  scanMarks?: ScanMark[];
}) {
  if (!canEditPieces(activeEnsemble() ?? PUBLIC_ID))
    return localLibrary.add(song);
  const m = await api<PieceMetadata>(base(), "POST", {
    title: song.title,
    content: {
      format: song.format,
      schemaVersion: 1,
      body: song.format === "score" ? JSON.parse(song.xml) : song.xml,
    },
    idempotencyKey: crypto.randomUUID(),
  });
  metadata.set(m.id, m);
  notify?.();
  return m.id;
}
async function update(id: string, op: string, value: unknown, key?: string) {
  if (!canEditPieces(activeEnsemble() ?? PUBLIC_ID))
    throw new ApiError("forbidden", 403);
  try {
    const m = await api<PieceMetadata>(`${base()}/${id}`, "PATCH", {
      op,
      value,
      ...(key ? { key } : {}),
      expectedRevision: metadata.get(id)?.revision,
    });
    metadata.set(id, m);
    notify?.();
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const m = await api<PieceMetadata>(`${base()}/${id}`);
      metadata.set(id, m);
      notify?.();
      setTimeout(() => {
        notify?.();
        window.dispatchEvent(new Event("piece:conflict"));
      }, 0);
    }
    throw e;
  }
}
export async function updateSongMetadata(
  id: string,
  patch: {
    title?: string;
    ensemble?: string;
    swing?: boolean;
    partName?: { partId: string; name: string };
    clef?: { partId: string; clef: VoiceClef };
    percussion?: { partId: string; on: boolean };
    removedParts?: string[];
    splitParts?: string[];
  },
) {
  if (patch.title !== undefined) await update(id, "title", patch.title);
  if (patch.swing !== undefined) await update(id, "swing", patch.swing);
  if (patch.partName)
    await update(id, "partName", patch.partName.name, patch.partName.partId);
  if (patch.percussion) {
    const percussion = {
      ...((metadata.get(id)?.settings.formatDefaults as any)?.percussion ?? {}),
      [patch.percussion.partId]: patch.percussion.on,
    };
    await update(id, "defaults", percussion, "percussion");
  }
  if (patch.clef) await update(id, "clef", patch.clef.clef, patch.clef.partId);
  for (const [field, op] of [
    ["removedParts", "removed"],
    ["splitParts", "split"],
  ] as const)
    if (patch[field]) {
      const previous = (metadata.get(id)?.settings[field] ?? {}) as Record<
        string,
        unknown
      >;
      for (const key of new Set([...Object.keys(previous), ...patch[field]!]))
        if (!!previous[key] !== patch[field]!.includes(key))
          await update(id, op, patch[field]!.includes(key) ? true : null, key);
    }
}
export async function deleteImportedSong(id: string) {
  await api(`${base()}/${id}`, "DELETE");
  metadata.delete(id);
  notify?.();
}
export async function saveSongConfig(
  id: string,
  config: {
    transpose: number;
    bpm: number;
    sections: { label: string; beat: number }[];
  },
) {
  await update(id, "replace", { ...config, played: true });
}
export async function saveSongSections(
  id: string,
  sections: { label: string; beat: number }[],
) {
  await update(id, "saved", sections, "sections");
  await update(id, "saved", true, "played");
}
export async function saveScanMarks(_id: string, _marks: ScanMark[]) {
  /* Phase 4 owns scan annotations. */
}
/** Reads a .musicxml/.xml file as-is, or unzips a compressed .mxl (MuseScore's default export format). */
export async function readScoreFile(file: File): Promise<string> {
  const isCompressed = file.name.toLowerCase().endsWith(".mxl");
  if (!isCompressed) return file.text();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(bytes);

  const containerXml = entries["META-INF/container.xml"];
  if (containerXml) {
    const containerText = strFromU8(containerXml);
    const match = containerText.match(/full-path="([^"]+)"/);
    const targetPath = match?.[1];
    if (targetPath && entries[targetPath])
      return strFromU8(entries[targetPath]);
  }

  const xmlEntryName = Object.keys(entries).find(
    (name) => /\.(musicxml|xml)$/i.test(name) && !name.startsWith("META-INF/"),
  );
  if (xmlEntryName) return strFromU8(entries[xmlEntryName]);

  throw new Error("No MusicXML data found inside the .mxl file");
}
