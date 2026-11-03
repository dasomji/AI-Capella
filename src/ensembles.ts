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
  feedback?: boolean;
}
export let ENSEMBLES: Ensemble[] = [];
export let account: { id: string; email: string; name: string } | null = null;
const key = () => `lightscore-ensemble:${account?.id}`;
export async function initializeEnsembles() {
  const me = await api("/me");
  account = me.user;
  await refreshEnsembleNames();
}
export async function refreshEnsembleNames() {
  ENSEMBLES = await api("/ensembles");
}
export const ensembleById = (id: string) => ENSEMBLES.find((e) => e.id === id);
export const unlockedEnsembles = () => ENSEMBLES.map((e) => e.id);
export const leads = (id: string) => !!ensembleById(id)?.isLead;
export const canEditPieces = (id: string) =>
  leads(id) || !!ensembleById(id)?.capabilities.editPieces;
export const canManageMembers = (id: string) =>
  leads(id) || !!ensembleById(id)?.capabilities.manageMembers;
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
