import {
  toastRecipe,
  toastPlacementRecipe,
  type ToastOptions,
} from "../recipes/overlays";
import { buttonRecipe } from "../recipes/controls";
import { t } from "../../i18n";
import { readTheme } from "../theme";
import { getActiveDialog, subscribeDialogStack } from "./dialog";
import { toastPart } from "../parts-common";
export interface ToastMessage {
  text: string;
  kind: NonNullable<ToastOptions["kind"]>;
  id: number;
  persistent?: boolean;
  action?: { label: string; onSelect: () => void };
}
function duration(role: string) {
  const value = readTheme().roles[role];
  return parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
}
let message: ToastMessage | null = null;
let sequence = 0;
const pending: ToastMessage[] = [];
// A persistent error must not accumulate an unbounded backlog of recurring notices.
const maxPending = 10;
function identical(a: ToastMessage, b: ToastMessage) {
  return a.text === b.text && a.kind === b.kind && !!a.persistent === !!b.persistent
    && a.action?.label === b.action?.label && a.action?.onSelect === b.action?.onSelect;
}
let timer: ReturnType<typeof setTimeout> | undefined;
let fadeTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
export function subscribeToast(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function getToast() {
  return message;
}
export function dismissToast() {
  clearTimeout(timer);
  clearTimeout(fadeTimer);
  message = pending.shift() ?? null;
  if (message) {
    render();
    startTimer();
    listeners.forEach((fn) => fn());
    return;
  }
  const host =
    typeof document === "undefined" ? null : document.getElementById("toast");
  if (host) {
    host.classList.remove("show");
    host.dataset.toastHidden = "true";
    host.inert = true;
    // Keep the announcement and visible text during the complete exit fade.
    fadeTimer = setTimeout(() => {
      host.hidePopover?.();
      host.textContent = "";
    }, duration("toast-duration-exit"));
  }
  listeners.forEach((fn) => fn());
}
/** One notifier: a modal owns its active controls, then stack changes return it to body. */
function transportHost() {
  if (typeof document === "undefined") return;
  const host = document.getElementById("toast");
  if (!host) return;
  const parent = getActiveDialog() ?? document.body;
  if (host.parentElement !== parent) {
    const focused = host.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    host.hidePopover?.();
    parent.append(host);
    if (host.textContent) host.showPopover?.();
    focused?.focus({preventScroll:true});
  }
}
subscribeDialogStack(transportHost);
function render() {
  if (typeof document === "undefined" || !message) return;
  let host = document.getElementById("toast");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast";
    host.setAttribute("popover", "manual");
    document.body.append(host);
  }
  transportHost();
  for (const [key, value] of Object.entries(toastPart(message.kind)))
    host.setAttribute(key, String(value));
  const text = document.createElement("span");
  text.className = "tw:min-w-flush tw:flex-1 tw:whitespace-normal tw:wrap-anywhere tw:max-panel:basis-full";
  text.textContent = message.text;
  host.replaceChildren(text);
  if (message.action) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = buttonRecipe({ intent: "secondary" });
    action.textContent = message.action.label;
    const current = message;
    action.onclick = () => {
      current.action!.onSelect();
      if (message?.id === current.id) dismissToast();
    };
    host.append(action);
  }
  if (message.kind === "error" || message.persistent || message.action) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = buttonRecipe({ intent: "secondary" });
    close.textContent = "×";
    close.setAttribute("aria-label", t("close"));
    close.onclick = dismissToast;
    host.append(close);
  }
  host.className =
    toastRecipe({
      kind: message.kind,
      font: document.querySelector(".admin-shell,.account-stage")
        ? "auth"
        : "body",
    }) +
    " " +
    toastPlacementRecipe();
  host.inert = false;
  delete host.dataset.toastHidden;
  host.showPopover?.();
  // Commit the hidden pose before transitioning the replacement into view.
  host.getBoundingClientRect();
  host.classList.add("show");
}
function persistent(value: ToastMessage) {
  return value.kind === "error" || value.persistent || !!value.action;
}
function startTimer() {
  clearTimeout(timer);
  if (message && !persistent(message)) timer = setTimeout(dismissToast, duration("toast-duration-info"));
}
/** Errors and actionable prompts remain until dismissed; subsequent notices wait their turn. */
export function toast(
  text: string,
  kind: ToastMessage["kind"] = "info",
  options: Pick<ToastMessage, "action" | "persistent"> = {},
) {
  const next = { text, kind, ...options, id: ++sequence };
  if ((message && identical(message, next)) || pending.some(value => identical(value, next))) return;
  clearTimeout(fadeTimer);
  if (message && persistent(message)) {
    if (pending.length === maxPending) pending.shift();
    pending.push(next);
    return;
  }
  message = next;
  render();
  startTimer();
  listeners.forEach((fn) => fn());
}
