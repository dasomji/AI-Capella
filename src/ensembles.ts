import { isOffline, setOffline } from './offline-state';
import { storageUnavailable, identityEpoch, offlineAccountId, purgeAccount, reconcilePrepared, rememberIdentity, restoreIdentity } from './offline-store';
import { lastVerifiedServerDate } from './domain-client';
import { ApiError } from './domain-client';
import { api } from "./domain-client";
import { pt } from "./i18n";
export const PUBLIC_ID = "public";
export interface Ensemble {
  id: string;
  name: string;
  kind: string | null;
  isLead: boolean;
  membershipId: string;
  capabilities: {
    manageMembers: boolean;
    editPieces: boolean;
    transcribe: boolean;
  };
  channel?: string;
}
export let ENSEMBLES: Ensemble[] = [];
export let account: { id: string; email: string; name: string } | null = null;
const key = () => `lightscore-ensemble:${account?.id}`;
export async function initializeEnsembles() {
  if(localStorage.getItem('lightscore-pending-signout')) {
    const response=await fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(response.ok){localStorage.removeItem('lightscore-pending-signout');location.replace('/?state=signed-out');}
    throw new ApiError(response.ok?'SIGNED_OUT':'SESSION_EXPIRED',401);
  }
  await restoreIdentity().catch(storageUnavailable);
  try {
    const me = await api('/me');
    const previous = offlineAccountId();
    if (previous && previous !== me.user.id) await purgeAccount(previous);
    account = me.user;
    await refreshEnsembleNames();
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      const previous = offlineAccountId(); if (error.status === 401 && previous) await purgeAccount(previous);
      throw error;
    }
    const saved = await restoreIdentity();
    if (!saved) throw error;
    account = saved.user; ENSEMBLES = saved.ensembles; setOffline(true);
  }
}
let refreshSerial=0;
export async function refreshEnsembleNames() {
  const serial=++refreshSerial;
  const user=account?.id, epoch=user?identityEpoch(user):0;
  const me=await api('/me');
  if(account && me.user.id!==account.id){await purgeAccount(account.id);location.reload();throw new ApiError('SESSION_EXPIRED',401);}
  const rows = await api<Ensemble[]>('/ensembles');
  if (!account) return;
  if(user && epoch!==identityEpoch(user))throw new ApiError('SESSION_EXPIRED',401);
  ENSEMBLES = rows;
  const current=()=>account?.id===user && identityEpoch(user!)===epoch && ENSEMBLES===rows;
  const identity=account, verified=lastVerifiedServerDate();
  // Browser storage must never hold the online sign-in path hostage.
  void (async()=>{
    try {await rememberIdentity(identity,rows,verified,()=>current() && serial===refreshSerial);}catch(error){storageUnavailable(error);return;}
    let latest:Ensemble[];
    try {latest=await api<Ensemble[]>('/ensembles');}catch{return;}
    if(current())await reconcilePrepared(identity.id,[...new Set([...rows,...latest].map(e=>e.id))],()=>current() && serial===refreshSerial);
  })().catch(storageUnavailable);
  setOffline(false);
}
export const ensembleById = (id: string) => ENSEMBLES.find((e) => e.id === id);
export const unlockedEnsembles = () => ENSEMBLES.map((e) => e.id);
export const leads = (id: string) => !!ensembleById(id)?.isLead;
export const canEditPieces = (id: string) =>
  !isOffline() && (leads(id) || !!ensembleById(id)?.capabilities.editPieces);
export const canManageMembers = (id: string) =>
  !isOffline() && (leads(id) || !!ensembleById(id)?.capabilities.manageMembers);
export function activeEnsemble(): string | null {
  const id = localStorage.getItem(key());
  return id === PUBLIC_ID || ENSEMBLES.some((e) => e.id === id)
    ? id
    : (ENSEMBLES[0]?.id ?? null);
}
export const setActiveEnsemble = (id: string) =>
  localStorage.setItem(key(), id);
export const ensembleName = (id: string) =>
  id === PUBLIC_ID ? pt("samples") : (ensembleById(id)?.name ?? id);
export async function renameEnsemble(id: string, name: string) {
  await api(`/ensembles/${id}`, "PATCH", { name });
  await refreshEnsembleNames();
}
export function forgetEnsemble(id: string) {
  ENSEMBLES = ENSEMBLES.filter((e) => e.id !== id);
  if (localStorage.getItem(key()) === id) localStorage.removeItem(key());
}
