import type { PieceMetadata } from './api/domain';
export const OFFLINE_WINDOW_MS = Math.min(14, Math.max(1, Number(import.meta.env.VITE_OFFLINE_WINDOW_DAYS) || 14)) * 24 * 60 * 60 * 1000;
const POINTER = 'lightscore-offline-account';
export const privatePrefix = (user: string) => `lightscore-private:${encodeURIComponent(user)}:`;
export const privateName = (user: string, ensemble: string) => privatePrefix(user) + encodeURIComponent(ensemble);
export const withinOfflineWindow = (verified: number, now = Date.now(), windowMs = OFFLINE_WINDOW_MS) => Number.isFinite(verified) && now >= verified && now - verified <= windowMs;
export const offlineWindow = () => localStorage.getItem('lightscore-shared-device') === '1' ? Math.min(OFFLINE_WINDOW_MS,86400000) : OFFLINE_WINDOW_MS;
export const ensembleEpoch = (user: string, ensemble: string) => Number(localStorage.getItem(`lightscore-epoch:${user}:${ensemble}`) || 0);
let storageAvailable=true;
export const offlineStorageAvailable=()=>storageAvailable;
export function storageUnavailable(error?: unknown) { if(error instanceof Error && error.message==='Offline access cleared')return;storageAvailable=false;window.dispatchEvent(new CustomEvent('offline:unavailable',{detail:error})); }
const epochs = new Map<string, number>();
export const identityEpoch = (user: string) => epochs.get(user) ?? 0;
export function offlineAccountId(): string | null { return localStorage.getItem(POINTER); }
async function access<T>(user: string, ensemble: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>, valid = () => true): Promise<T> {
  const epoch = epochs.get(user) ?? 0, scopeEpoch = ensembleEpoch(user,ensemble);
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(privateName(user, ensemble), 1);
    open.onupgradeneeded = () => open.result.createObjectStore('data');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      try {
      if (!valid() || scopeEpoch !== ensembleEpoch(user,ensemble) || epoch !== (epochs.get(user) ?? 0) || (mode === 'readwrite' && ensemble !== '_identity' && offlineAccountId() !== user)) { db.close(); reject(Error('Offline access cleared')); return; }
      db.onversionchange = () => db.close();
      const tx = db.transaction('data', mode);
      const req = operation(tx.objectStore('data'));
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
      } catch(error) { db.close();reject(error); }
    };
  });
}
export interface Prepared { metadata: PieceMetadata; body: string }
export async function readPrepared(user: string, ensemble: string): Promise<Prepared[]> {
  if (typeof indexedDB === 'undefined') return [];
  return (await access<Prepared[]>(user, ensemble, 'readonly', s => s.getAll())).filter(v => v?.metadata && typeof v.body === 'string');
}
export const readOfflineCatalog = async (user: string, ensemble: string): Promise<PieceMetadata[]> => typeof indexedDB === 'undefined' ? [] : (await access<PieceMetadata[]>(user,ensemble,'readonly',s=>s.get('catalog'))) ?? [];
export async function writeOfflineCatalog(user: string, ensemble: string, rows: PieceMetadata[], valid = () => true) { if(typeof indexedDB !== 'undefined') await access(user,ensemble,'readwrite',s=>s.put(rows,'catalog'),valid); }
export async function writePrepared(user: string, row: Prepared, valid = () => true) {
  const identity=await access<any>(user,'_identity','readonly',s=>s.get('session'));
  if(!identity?.ensembles.some((e: {id:string})=>e.id===row.metadata.ensembleId) || !withinOfflineWindow(identity.verified,Date.now(),offlineWindow())) throw Error('Offline permission expired');
  await access(user, row.metadata.ensembleId, 'readwrite', s => s.put(row, `${row.metadata.id}:${row.metadata.contentHash}`),valid);
  // Only retain the newest authorized version of each piece.
  const rows = await readPrepared(user, row.metadata.ensembleId);
  for (const old of rows) if (old.metadata.id === row.metadata.id && old.metadata.contentHash !== row.metadata.contentHash) await removePrepared(user, old.metadata);
}
export async function removePrepared(user: string, m: PieceMetadata) {
  await access(user, m.ensembleId, 'readwrite', s => s.delete(`${m.id}:${m.contentHash}`));
}
async function drop(name: string) {
  await new Promise<void>((resolve, reject) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); });
}
export async function purgeAccount(user: string) {
  epochs.set(user, (epochs.get(user) ?? 0) + 1);
  if (offlineAccountId() === user) localStorage.removeItem(POINTER);
  localStorage.removeItem(`lightscore-place:${user}`);
  localStorage.removeItem(`lightscore-ensemble:${user}`);
  for (const db of typeof indexedDB === 'undefined' ? [] : await indexedDB.databases()) if (db.name?.startsWith(privatePrefix(user))) await drop(db.name);
  window.dispatchEvent(new Event('offline:purged'));
}
function ensemblePurged(detail: {user:string;ensemble:string;revoked?:boolean}) {window.dispatchEvent(new CustomEvent('offline:ensemble-purged',{detail}));}
const channel = typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined' ? new window.BroadcastChannel('lightscore-private-purge') : null;
if(channel) channel.onmessage=event=>ensemblePurged(event.data);
export async function purgeEnsemble(user: string, ensemble: string, revoked = true) {
  localStorage.setItem(`lightscore-epoch:${user}:${ensemble}`,String(ensembleEpoch(user,ensemble)+1));
  const detail={user,ensemble,revoked};ensemblePurged(detail);channel?.postMessage(detail);
  await drop(privateName(user, ensemble));
}
export async function reconcilePrepared(user: string, allowed: string[], current = () => true) {
  for (const db of typeof indexedDB === 'undefined' ? [] : await indexedDB.databases()) if (db.name?.startsWith(privatePrefix(user)) && db.name !== privateName(user, '_identity') && !allowed.some(id => db.name === privateName(user, id))) if(current()) await purgeEnsemble(user,decodeURIComponent(db.name.slice(privatePrefix(user).length)));
}
export async function rememberIdentity(user: {id: string; email: string; name: string}, ensembles: unknown[], verified: number, valid = () => true) {
  if (typeof indexedDB === 'undefined') return;
  const previous = offlineAccountId();
  if (previous && previous !== user.id) await purgeAccount(previous);
  await access(user.id, '_identity', 'readwrite', s => s.put({user, ensembles, verified}, 'session'),valid);
  if(!valid())return;
  localStorage.setItem(POINTER, user.id);
}
export async function restoreIdentity(): Promise<any | null> {
  const user = offlineAccountId();
  if (!user) return null;
  const identity = await access<any>(user, '_identity', 'readonly', s => s.get('session'));
  if (!identity || !withinOfflineWindow(identity.verified,Date.now(),offlineWindow())) {
    // A clock behind the server denies access but does not destroy a valid copy.
    if (!identity || Date.now() - identity.verified > offlineWindow()) await purgeAccount(user);
    return null;
  }
  return identity;
}

export async function purgeLandingIdentity() {
  const purge=async()=>{const user=offlineAccountId();if(user)await purgeAccount(user);};
  const state=new URLSearchParams(location.search).get('state');
  if(state==='expired'||state==='signed-out'||localStorage.getItem('lightscore-pending-signout'))await purge();
  if(localStorage.getItem('lightscore-pending-signout') && navigator.onLine){const r=await fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(r.ok)localStorage.removeItem('lightscore-pending-signout');}
  const r=await fetch('/api/me',{cache:'no-store'});if(r.status===401)await purge();
}
