import { z } from 'zod';
export const safeAdminText = z.string().refine(s => !s.includes('\0') && s.isWellFormed(), 'Expected well-formed text without NUL');
export const adminQuery = z.object({
    search: safeAdminText.max(200).default(''), cursor: safeAdminText.max(2048).optional(), limit: z.coerce.number().int().min(1).max(100).default(30),
    sort: z.enum(['id', 'created', 'updated', 'name']).default('id'), direction: z.enum(['asc', 'desc']).default('asc'),
    all:z.enum(['true']).optional(),
    verified: z.enum(['true', 'false']).optional(), sysadmin: z.enum(['true', 'false']).optional(),
    from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
    ensemble: safeAdminText.max(200).optional(), user: safeAdminText.max(200).optional(), format: z.enum(['musicxml', 'score']).optional(),
    actor: safeAdminText.max(200).optional(), target: safeAdminText.max(200).optional(), targetType: z.enum(['user', 'ensemble', 'piece', 'original', 'transcription', 'membership', 'invitation']).optional(), action: safeAdminText.max(200).optional(), outcome: safeAdminText.max(40).optional(), state: safeAdminText.max(40).optional(),
}).refine(q => !q.from || !q.to || Date.parse(q.from) < Date.parse(q.to), { message: 'Expected from < to, with offset or Z' });
export const adminAccess = z.object({ reason: safeAdminText.trim().min(1).max(1000) }).strict();
export const adminControl = z.object({ paused: z.boolean(), reason: safeAdminText.trim().min(1).max(1000) }).strict();
