import { z } from 'zod';
const n = z.number().finite();
const beat = n.nonnegative();
const selection = { pieceId: z.string().min(1).max(200), versionNo: n.int().positive() };
const id = z.string().min(1).max(200);
export const commandSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('selectPiece'), pieceId: id, versionNo: n.int().positive() }).strict(),
    z.object({ type: z.literal('play'), fromBeat: beat.optional(), pieceId: id.optional(), versionNo: n.int().positive().optional() }).strict().refine(c => c.fromBeat === undefined || (c.pieceId !== undefined && c.versionNo !== undefined)),
    ...(['pause', 'stop', 'playStartingTones'] as const).map(type => z.object({ type: z.literal(type) }).strict()),
    z.object({ type: z.literal('seek'), ...selection, beat }).strict(),
    z.object({ type: z.literal('setTempo'), ...selection, bpm: n.min(1).max(1000) }).strict(),
    z.object({ type: z.literal('setTransposition'), ...selection, semitones: n.int().min(-48).max(48) }).strict(),
    z.object({ type: z.literal('setLoop'), ...selection, enabled: z.boolean(), startBeat: beat.optional(), endBeat: beat.optional() }).strict(),
    z.object({ type: z.literal('setMetronome'), enabled: z.boolean() }).strict(),
    z.object({ type: z.literal('setCountIn'), bars: n.int().min(0).max(8) }).strict(),
    z.object({ type: z.literal('setStartingTones'), enabled: z.boolean() }).strict(),
]);
export const envelopeSchema = z.object({ ensembleId: id, commandId: z.uuid(), baseRevision: n.int().nonnegative(), clientSentAt: n, command: commandSchema }).strict();
export const stateSchema = z.object({
    ensembleId: id, revision: n.int().nonnegative(), pieceId: id.nullable(), versionNo: n.int().positive().nullable(),
    effectiveAt: n.optional(), // Legacy persisted states fall back to anchor.serverTime.
    status: z.enum(['stopped', 'countingIn', 'playing', 'paused']), anchor: z.object({ serverTime: n, beat }),
    bpm: n.min(1).max(1000), transposition: n.int().min(-48).max(48),
    loop: z.object({ enabled: z.boolean(), startBeat: beat.nullable(), endBeat: beat.nullable() }),
    metronome: z.boolean(), countIn: z.object({ bars: n.int().min(0).max(8) }), countInUntil: n.nullable(),
    startingTones: z.object({ enabled: z.boolean() }), startingTonesUntil: n.nullable(), endsAt: n.nullable(), updatedBy: id, updatedAt: n,
}).strict();
export const rejectionCodeSchema = z.enum(['duplicate', 'stale', 'expired', 'invalid', 'forbidden', 'not_found', 'rate_limited', 'unavailable', 'session_expired']);
export const ackSchema = z.object({ commandId: z.string(), status: z.enum(['accepted', 'rejected']), revision: n.int().nonnegative().optional(), code: rejectionCodeSchema.optional(), state: stateSchema.optional() }).strict();
export const snapshotAckSchema = z.union([z.object({ state: stateSchema }).strict(), z.object({ code: rejectionCodeSchema }).strict()]);
export const joinAckSchema = snapshotAckSchema;
export const joinSchema = z.object({ ensembleId: z.uuid() }).strict();
export type Command = z.infer<typeof commandSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
export type RehearsalState = z.infer<typeof stateSchema>;
export type Ack = z.infer<typeof ackSchema>;
export type RejectionCode = z.infer<typeof rejectionCodeSchema>;
/** Implemented by 3b; subscribe includes sender, snapshot must precede commands after reconnect. */
export interface RehearsalTransport {
    snapshot(ensembleId: string): Promise<RehearsalState>;
    command(envelope: Envelope): Promise<Ack>;
    subscribe(listener: (state: RehearsalState) => void): () => void;
    ping(): Promise<number>;
}
