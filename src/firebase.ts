// Disabled scan/feedback compatibility. No Firebase SDK or client credentials.
export const db = null;
export async function ensureSignedIn(): Promise<void> {}
export function currentUid(): string { return ''; }
export async function getIdToken(): Promise<string> { throw new Error('Shared service unavailable'); }
