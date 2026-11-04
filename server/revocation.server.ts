const key = Symbol.for('lightscore.revocations');
const globals = globalThis as typeof globalThis & { [key]?: Set<(token: string) => void> };
const listeners = globals[key] ??= new Set();
export function revoked(token: string) { for (const listener of listeners) listener(token); }
export function onRevoked(listener: (token: string) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
