import {
  toastRecipe,
  toastPlacementRecipe,
  type ToastOptions,
} from "../recipes/overlays";
import { readTheme } from "../theme";
import { toastPart } from "../parts";
export interface ToastMessage {
  text: string;
  kind: NonNullable<ToastOptions["kind"]>;
  id: number;
}
let message: ToastMessage | null = null;
let sequence = 0;
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
  message = null;
  const host =
    typeof document === "undefined" ? null : document.getElementById("toast");
  if (host) {
    host.classList.remove("show");
    // Keep the announcement and visible text during the complete exit fade.
    fadeTimer = setTimeout(() => {
      host.hidePopover?.();
      host.textContent = "";
    }, parseFloat(readTheme().roles["toast-duration-exit"]));
  }
  listeners.forEach((fn) => fn());
}
/** One body-owned top-layer notifier; survives every overlay transport's removal. */
function render() {
  if (typeof document === "undefined" || !message) return;
  let host = document.getElementById("toast");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast";
    host.setAttribute("popover", "manual");
    document.body.append(host);
  }
  if (host.parentElement !== document.body) document.body.append(host);
  for (const [key, value] of Object.entries(toastPart(message.kind)))
    host.setAttribute(key, String(value));
  host.textContent = message.text;
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
  host.showPopover?.();
  // Commit the hidden pose before transitioning the replacement into view.
  host.getBoundingClientRect();
  host.classList.add("show");
}
export function toast(text: string, kind: ToastMessage["kind"] = "info") {
  clearTimeout(timer);
  clearTimeout(fadeTimer);
  message = { text, kind, id: ++sequence };
  render();
  listeners.forEach((fn) => fn());
  timer = setTimeout(dismissToast, parseFloat(readTheme().roles[kind === "error" ? "toast-duration-error" : "toast-duration-info"]));
}
