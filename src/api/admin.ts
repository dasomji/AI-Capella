import { z } from 'zod';
export const safeAdminText = z.string().refine(s => !s.includes('\0') && s.isWellFormed(), 'Expected well-formed text without NUL');
export const adminQuery = z.object({
    search: safeAdminText.max(200).default(''), cursor: safeAdminText.max(2048).optional(), limit: z.coerce.number().int().min(1).max(100).default(30),
    sort: z.enum(['id', 'created', 'updated', 'name', 'email', 'ensemble']).default('id'), direction: z.enum(['asc', 'desc']).default('asc'),
    all:z.enum(['true']).optional(),
    verified: z.enum(['true', 'false']).optional(), sysadmin: z.enum(['true', 'false']).optional(),
    from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
    ensemble: safeAdminText.max(200).optional(), user: safeAdminText.max(200).optional(), format: z.enum(['musicxml', 'score']).optional(),
    actor: safeAdminText.max(200).optional(), target: safeAdminText.max(200).optional(), targetType: z.enum(['user', 'ensemble', 'piece', 'original', 'transcription', 'membership', 'invitation']).optional(), action: safeAdminText.max(200).optional(), outcome: safeAdminText.max(40).optional(), state: safeAdminText.max(40).optional(),
}).refine(q => !q.from || !q.to || Date.parse(q.from) < Date.parse(q.to), { message: 'Expected from < to, with offset or Z' });
export const adminAccess = z.object({ reason: safeAdminText.trim().min(1).max(1000) }).strict();
export const adminControl = z.object({ paused: z.boolean(), reason: safeAdminText.trim().min(1).max(1000) }).strict();

// Snapshot comparison makes stale browser edits explicit without a new timestamp/version column.
export const adminPermissions = z.object({ isLead:z.boolean(), manageMembers:z.boolean(), editPieces:z.boolean(), transcribe:z.boolean() }).strict();
export const adminMemberAdd = adminAccess.extend({userId:safeAdminText.min(1).max(200),permissions:adminPermissions}).strict();
export const adminMemberEdit = adminAccess.extend({permissions:adminPermissions,expected:adminPermissions}).strict();
export const adminMemberRemove = adminAccess.extend({expected:adminPermissions}).strict();
export const adminRoleEdit = adminAccess.extend({sysadmin:z.boolean(),expected:z.boolean()}).strict();
export const adminInvitation = adminAccess.extend({email:safeAdminText.trim().toLowerCase().pipe(z.email()),language:z.enum(['en','de']),capabilities:adminPermissions.omit({isLead:true}),idempotencyKey:safeAdminText.min(1).max(200)}).strict();
