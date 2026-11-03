import { z } from "zod";
export const capabilities = z
  .object({
    manageMembers: z.boolean().default(false),
    editPieces: z.boolean().default(false),
    transcribe: z.boolean().default(false),
  })
  .strict();
export const ensembleInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    kind: z.enum(["choir", "band", "other"]).optional(),
  })
  .strict();
export const memberInput = capabilities
  .partial()
  .extend({ isLead: z.boolean().optional(), stepDown: z.boolean().optional() })
  .strict();
export const invitationInput = z
  .object({
    email: z.email().transform((v) => v.trim().toLowerCase()),
    language: z.enum(["de", "en"]).optional(),
    capabilities: capabilities.optional(),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();
const number = z.number().finite();
export const nativeScore = z
  .object({
    title: z.string(),
    parts: z
      .array(z.object({ id: z.string(), name: z.string() }).passthrough())
      .min(1),
    notes: z
      .array(
        z
          .object({
            partId: z.string(),
            midi: number.min(0).max(127),
            startBeat: number.nonnegative(),
            durationBeats: number.nonnegative(),
            measureNumber: number,
          })
          .passthrough(),
      )
      .min(1),
    measures: z.array(
      z
        .object({
          number,
          startBeat: number,
          beats: number.positive(),
          beatType: number.positive(),
          fifths: number,
        })
        .passthrough(),
    ),
    slurs: z.array(
      z
        .object({
          partId: z.string(),
          startBeat: number,
          startMidi: number,
          endBeat: number,
          endMidi: number,
        })
        .passthrough(),
    ),
    totalBeats: number.nonnegative(),
    rehearsalMarks: z.array(z.object({ label: z.string(), beat: number })),
  })
  .passthrough();
export const contentInput = z.discriminatedUnion("format", [
  z.object({
    format: z.literal("musicxml"),
    schemaVersion: z.literal(1),
    body: z.string(),
  }),
  z.object({
    format: z.literal("score"),
    schemaVersion: z.literal(1),
    body: nativeScore,
  }),
]);
export const createPieceInput = z
  .object({
    title: z.string().trim().min(1).max(500),
    content: contentInput,
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .strict();
export const versionInput = z
  .object({
    expectedRevision: z.number().int().positive(),
    content: contentInput,
  })
  .strict();
export const settingsInput = z
  .object({
    op: z.enum([
      "title",
      "partName",
      "clef",
      "removed",
      "split",
      "swing",
      "saved",
      "defaults",
      "replace",
    ]),
    key: z.string().min(1).max(200).optional(),
    value: z.json(),
    expectedRevision: z.number().int().positive().optional(),
  })
  .strict();
export const reorderInput = z
  .object({ pieceIds: z.array(z.string()).max(10000) })
  .strict();
export const metadataSchema = z.object({
  id: z.string(),
  ensembleId: z.string(),
  title: z.string(),
  sortKey: z.string(),
  format: z.enum(["musicxml", "score"]),
  revision: z.number(),
  versionNo: z.number(),
  contentHash: z.string(),
  size: z.number(),
  updatedAt: z.string(),
  settings: z.record(z.string(), z.json()),
});
export type PieceMetadata = z.infer<typeof metadataSchema>;
