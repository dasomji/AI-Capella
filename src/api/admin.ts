import { z } from 'zod';
export const adminQuery = z.object({
    search: z.string().max(200).default(''), cursor: z.string().max(2048).optional(), limit: z.coerce.number().int().min(1).max(100).default(30),
    sort: z.enum(['id', 'created', 'name']).default('id'), direction: z.enum(['asc', 'desc']).default('asc'),
    verified: z.enum(['true', 'false']).optional(), sysadmin: z.enum(['true', 'false']).optional(),
    from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
    ensemble: z.string().max(200).optional(), user: z.string().max(200).optional(), format: z.enum(['musicxml', 'score']).optional(),
    actor: z.string().max(200).optional(), target: z.string().max(200).optional(), targetType: z.enum(['user', 'ensemble', 'piece', 'original', 'transcription', 'membership', 'invitation']).optional(), action: z.string().max(200).optional(), outcome: z.string().max(40).optional(), state: z.string().max(40).optional(),
}).refine(q => !q.from || !q.to || Date.parse(q.from) < Date.parse(q.to), { message: 'Expected from < to, with offset or Z' });
export const adminAccess = z.object({ reason: z.string().trim().max(1000).default('') }).strict();
export const adminControl = z.object({ paused: z.boolean(), reason: z.string().trim().min(1).max(1000) }).strict();
