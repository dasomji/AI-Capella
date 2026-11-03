// Legacy integration is intentionally disabled. Phase 2 replaces these callers.
export const db = null;
export const isFirebaseConfigured = false;
export async function ensureSignedIn(): Promise<void> {}
export function currentUid(): string { return ''; }
export async function getIdToken(): Promise<string> { throw new Error('Shared service unavailable'); }
