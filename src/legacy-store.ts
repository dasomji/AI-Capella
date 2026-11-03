// Disabled compatibility surface for the retained legacy integration code.
// No network, credentials, persistence or Firebase SDK is present.
export type Unsubscribe = () => void;
export class Bytes {
  constructor(private bytes: Uint8Array) {}
  static fromUint8Array(bytes: Uint8Array) { return new Bytes(bytes); }
  toUint8Array() { return this.bytes; }
}
export class Timestamp { toMillis() { return 0; } }
type Snapshot = { metadata: { fromCache: boolean }; id: string; data(): Record<string, any>; exists(): boolean; docs: Snapshot[]; docChanges(): { type: string; doc: Snapshot }[] };
const snapshot: Snapshot = { metadata: { fromCache: true }, id: '', data: () => ({}), exists: () => false, docs: [], docChanges: () => [] };
export const doc = (..._args: unknown[]) => ({});
export const collection = doc, query = doc, where = doc;
export const serverTimestamp = () => null;
export async function getDoc(..._args: unknown[]) { return snapshot; }
export const getDocFromServer = getDoc;
export async function setDoc(..._args: unknown[]) { throw new Error('Shared storage unavailable'); }
export const updateDoc = setDoc, deleteDoc = setDoc;
export async function addDoc(..._args: unknown[]): Promise<{ id: string }> { throw new Error('Shared storage unavailable'); }
export function onSnapshot(_ref: unknown, callback: (snapshot: Snapshot) => void, error?: (error: unknown) => void): Unsubscribe;
export function onSnapshot(_ref: unknown, options: unknown, callback: (snapshot: Snapshot) => void, error?: (error: unknown) => void): Unsubscribe;
export function onSnapshot(_ref: unknown, arg: unknown, callback?: unknown, _error?: unknown): Unsubscribe { if (typeof arg === 'function') arg(snapshot); else if (typeof callback === 'function') callback(snapshot); return () => {}; }
export function writeBatch(..._args: unknown[]) { return { update: (..._args: unknown[]) => {}, delete: (..._args: unknown[]) => {}, commit: async () => { throw new Error('Shared storage unavailable'); } }; }
