import { panelMotion } from "./panel";
import { anchorPopover } from "./popover";

/** Native showModal owns background inertness, including later portals and stacked modals. */
export type CancelReason = "escape" | "outside" | "button";
export interface DialogBehaviorOptions {
  opener?: Element | null;
  /** D48 anchored presentation; fixed for this opening, including resize. */
  anchor?: HTMLElement;
  align?: "start" | "end" | "center";
  /** Historical sheet motion name aliases centered fade; no swipe dismissal. */
  motion?: "sheet" | "panel";
  initialFocus?: HTMLElement | (() => HTMLElement | null);
  escape?: "close" | "ignore";
  outside?: "close" | "ignore";
  busyCancel?: "block" | "allow";
  busy?: boolean;
  /** Notification after an actual close. Never called by React effect cleanup. */
  onClose?: () => void;
  /** A user cancellation request (Escape, outside or cancel button). */
  onCancel?: (reason: CancelReason) => void;
  /** Transport hook: retain the native top layer until the exit completes. */
  exit?: (finish: () => void) => void;
}
export interface DialogController {
  close(): void;
  /** Silent immediate teardown for unmount / controlled prop changes / StrictMode replay. */
  dispose(): void;
  requestClose(reason?: CancelReason): void;
  setBusy(busy: boolean): void;
}
const stackListeners = new Set<() => void>();
export function subscribeDialogStack(listener: () => void) {
  stackListeners.add(listener);
  return () => { stackListeners.delete(listener); };
}
const stack: { dialog: HTMLDialogElement; controller: DialogController }[] = [];
let previousOverflow = "";
let pointerOpener: HTMLElement | null = null;
const focusable =
  'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])';
// Safari does not focus buttons on pointer activation. Capture the actual initiating control.
if (typeof document !== "undefined")
  document.addEventListener(
    "pointerdown",
    (event) => {
      pointerOpener =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(focusable)
          : null;
    },
    true,
  );
export function getActiveDialog() {
  return stack.at(-1)?.dialog;
}
export function closeOverlay() {
  stack.at(-1)?.controller.close();
}
function targets(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(focusable)].filter((el) => {
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      if (node.hidden || node.inert) return false;
      if (node === root) break;
    }
    return !el.closest('[data-toast-hidden="true"]') && el.tabIndex >= 0 && el.getClientRects().length > 0;
  });
}
export function openDialog(
  dialog: HTMLDialogElement,
  options: DialogBehaviorOptions = {},
): DialogController {
  const existing = stack.find((entry) => entry.dialog === dialog);
  if (existing) return existing.controller;
  const doc = dialog.ownerDocument;
  const previousFocus =
    options.opener ??
    (pointerOpener?.isConnected ? pointerOpener : doc.activeElement);
  pointerOpener = null;
  let closed = false,
    closing = false,
    busy = options.busy ?? false;
  let closingChildren: DialogController[] | undefined;
  const motion =
    options.motion === "sheet" || options.motion === "panel"
        ? panelMotion(dialog)
        : undefined;
  const finish = (notify: boolean) => {
    if (closed) return;
    closed = true;
    motion?.dispose();
    unbindViewport();
    unplace?.();
    // Layers opened after an exit starts replace the closing layer; they are not its children.
    const index = stack.findIndex((entry) => entry.controller === controller);
    for (const child of (
      closingChildren ?? stack.slice(index + 1).map((entry) => entry.controller)
    ).reverse())
      child.dispose();
    dialog.removeEventListener("cancel", onCancel);
    dialog.removeEventListener("close", onNativeClose);
    dialog.removeEventListener("pointerdown", onPointer);
    dialog.removeEventListener("keydown", onKey);
    if (dialog.open) dialog.close();
    if (index >= 0) stack.splice(index, 1);
    stackListeners.forEach(listener => listener());
    if (!stack.length) doc.body.style.overflow = previousOverflow;
    if (
      previousFocus instanceof HTMLElement &&
      previousFocus.isConnected &&
      (!stack.length || stack.at(-1)!.dialog.contains(previousFocus)) &&
      !previousFocus.closest("[inert]")
    )
      previousFocus.focus({ preventScroll: true });
    if (notify) options.onClose?.();
  };
  const controller: DialogController = {
    setBusy(value) {
      busy = value;
      dialog.setAttribute("aria-busy", String(value));
    },
    requestClose(reason = "button") {
      if (
        closing ||
        closed ||
        (busy && options.busyCancel !== "allow") ||
        (reason === "escape" && options.escape === "ignore") ||
        (reason === "outside" && options.outside === "ignore")
      )
        return;
      options.onCancel?.(reason);
      controller.close();
    },
    close() {
      if (closed || closing) return;
      closing = true;
      const index = stack.findIndex((entry) => entry.controller === controller);
      closingChildren = stack.slice(index + 1).map((entry) => entry.controller);
      if (motion) motion.exit(() => finish(true));
      else if (options.exit) options.exit(() => finish(true));
      else finish(true);
    },
    dispose() {
      finish(false);
    },
  };
  const onCancel = (event: Event) => {
    event.preventDefault();
    controller.requestClose("escape");
  };
  // close events are queued; a StrictMode replay may already have reopened the element.
  const onNativeClose = () => {
    if (!dialog.open) finish(true);
  };
  const onPointer = (event: PointerEvent) => {
    if (
      getActiveDialog() !== dialog ||
      (event.target instanceof Element &&
        event.target.closest('[data-ds="toast"]'))
    )
      return;
    const panel =
      dialog.querySelector<HTMLElement>("[data-dialog-panel],.overlay-panel") ??
      dialog;
    const rect = panel.getBoundingClientRect();
    if (
      !panel.contains(event.target as Node) ||
      (event.target === dialog &&
        (event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom))
    )
      controller.requestClose("outside");
  };
  const onKey = (event: KeyboardEvent) => {
    if (getActiveDialog() !== dialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      controller.requestClose("escape");
    }
    if (event.key === "Tab") {
      const elements = targets(dialog),
        first = elements[0],
        last = elements.at(-1);
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (
        event.shiftKey &&
        (doc.activeElement === first || !dialog.contains(doc.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (doc.activeElement === last || !dialog.contains(doc.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  const view = doc.defaultView!;
  const viewport = view.visualViewport;
  let viewportFrame = 0;
  const fitViewport = () => {
    if (options.anchor || dialog.dataset.dialogLayout === "fullscreen") return;
    // Measured viewport geometry: inset the native centered dialog within the visible area.
    const gap = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue("--ds-space-content")) || 0;
    const width = viewport?.width ?? view.innerWidth;
    const height = viewport?.height ?? view.innerHeight;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    dialog.style.left = `max(${left + gap}px, env(safe-area-inset-left))`;
    dialog.style.right = `max(${Math.max(0, view.innerWidth - left - width) + gap}px, env(safe-area-inset-right))`;
    dialog.style.top = `max(${top + gap}px, env(safe-area-inset-top))`;
    dialog.style.bottom = `max(${Math.max(0, view.innerHeight - top - height) + gap}px, env(safe-area-inset-bottom))`;
    dialog.style.maxWidth = `calc(${width}px - max(${gap}px, env(safe-area-inset-left)) - max(${gap}px, env(safe-area-inset-right)))`;
    dialog.style.maxHeight = `calc(${height}px - max(${gap}px, env(safe-area-inset-top)) - max(${gap}px, env(safe-area-inset-bottom)))`;
    const focused = doc.activeElement;
    if (focused instanceof HTMLElement && dialog.contains(focused) && focused !== dialog)
      focused.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
  };
  const scheduleViewport = () => {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(fitViewport);
  };
  const unbindViewport = () => {
    cancelAnimationFrame(viewportFrame);
    view.removeEventListener("resize", scheduleViewport);
    viewport?.removeEventListener("resize", scheduleViewport);
    viewport?.removeEventListener("scroll", scheduleViewport);
    dialog.removeEventListener("focusin", scheduleViewport);
  };
  view.addEventListener("resize", scheduleViewport);
  viewport?.addEventListener("resize", scheduleViewport);
  viewport?.addEventListener("scroll", scheduleViewport);
  dialog.addEventListener("focusin", scheduleViewport);
  if (!dialog.isConnected) doc.body.append(dialog);
  dialog.tabIndex = -1;
  dialog.addEventListener("cancel", onCancel);
  dialog.addEventListener("close", onNativeClose);
  dialog.addEventListener("pointerdown", onPointer);
  dialog.addEventListener("keydown", onKey);
  if (!stack.length) previousOverflow = doc.body.style.overflow;
  dialog.showModal();
  fitViewport();
  const unplace = options.anchor ? anchorPopover(dialog, options.anchor, options.align) : undefined;
  stack.push({ dialog, controller });
  stackListeners.forEach(listener => listener());
  motion?.enter();
  doc.body.style.overflow = "hidden";
  controller.setBusy(busy);
  const initial =
    typeof options.initialFocus === "function"
      ? options.initialFocus()
      : options.initialFocus;
  (
    initial ??
    dialog.querySelector<HTMLElement>("[autofocus]") ??
    targets(dialog)[0] ??
    dialog
  ).focus({ preventScroll: true });
  return controller;
}
