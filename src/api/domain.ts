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
export const memberInput = z
  .object({
    manageMembers: z.boolean().optional(),
    editPieces: z.boolean().optional(),
    transcribe: z.boolean().optional(),
    isLead: z.boolean().optional(),
    stepDown: z.boolean().optional(),
  })
  .strict();
export const invitationInput = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
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
const partKey = z
  .string()
  .min(1)
  .max(200)
  .refine((k) => !["__proto__", "prototype", "constructor"].includes(k));
const sections = z
  .array(
    z
      .object({
        label: z.string().max(200),
        beat: z.number().finite().nonnegative(),
      })
      .strict(),
  )
  .max(1000);
const savedValues = {
  transpose: z.number().int().min(-48).max(48),
  bpm: z.number().finite().min(1).max(1000),
  sections,
  played: z.boolean(),
};
const savedSchema = z
  .object(
    Object.fromEntries(
      Object.entries(savedValues).map(([k, v]) => [k, v.optional()]),
    ),
  )
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
  .strict()
  .superRefine((v, ctx) => {
    let schema: z.ZodType = z.never();
    if (
      v.value === null &&
      v.key &&
      !["title", "swing", "replace"].includes(v.op)
    )
      return;
    switch (v.op) {
      case "title":
        schema = z.string().trim().min(1).max(500);
        break;
      case "partName":
        schema = z.string().max(200);
        break;
      case "clef":
        schema = z.enum(["treble", "treble8", "bass"]);
        break;
      case "removed":
      case "split":
      case "swing":
        schema = z.boolean();
        break;
      case "replace":
        schema = savedSchema;
        break;
      case "saved":
        schema = Object.hasOwn(savedValues, v.key ?? "") ? savedValues[v.key as keyof typeof savedValues] : z.never();
        break;
      case "defaults":
        schema =
          v.key === "percussion"
            ? z
                .record(partKey, z.boolean())
                .refine((v) => Object.keys(v).length <= 256)
            : z.never();
        break;
    }
    if (
      !schema.safeParse(v.value).success ||
      (v.key !== undefined && !partKey.safeParse(v.key).success)
    )
      ctx.addIssue({ code: "custom", message: "Invalid setting value" });
  });
export const reorderInput = z
  .object({
    pieceIds: z.array(z.string()).max(10000),
    expectedOrder: z.array(z.string()).max(10000),
  })
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

export const ensembleSchema = z.object({
  id: z.string(),
  membershipId: z.string(),
  name: z.string(),
  kind: z.enum(["choir", "band", "other"]).nullable(),
  isLead: z.boolean(),
  capabilities,
});
export const memberSchema = z.object({
  id: z.string(),
  ensembleId: z.string(),
  userId: z.string(),
  isLead: z.boolean(),
  capabilities,
  name: z.string().optional(),
  email: z.email().optional(),
});
export const invitationSchema = z.object({
  id: z.string(),
  email: z.email(),
  state: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: z.iso.datetime({ offset: true }),
  deliveryState: z.enum(["sent", "not_sent"]),
  sendCount: z.number().int(),
  capabilities,
});
export const domainErrorSchema = z.object({
  code: z.string(),
  current: z.union([metadataSchema,z.array(z.string())]).optional(),
});
