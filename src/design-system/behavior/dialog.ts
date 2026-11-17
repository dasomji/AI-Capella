/** Native showModal owns background inertness, including later portals and stacked modals. */
export type CancelReason = "escape" | "outside" | "button" | "swipe";
export interface DialogBehaviorOptions {
  opener?: Element | null;
  initialFocus?: HTMLElement | (() => HTMLElement | null);
  escape?: "close" | "ignore";
  outside?: "close" | "ignore";
  busyCancel?: "block" | "allow";
  busy?: boolean;
  /** Notification after an actual close. Never called by React effect cleanup. */
  onClose?: () => void;
  /** A user cancellation request (Escape, outside, cancel button or swipe). */
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
    return el.tabIndex >= 0 && el.getClientRects().length > 0;
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
  const finish = (notify: boolean) => {
    if (closed) return;
    closed = true;
    // Layers opened after an exit starts replace the closing layer; they are not its children.
    const index = stack.findIndex((entry) => entry.controller === controller);
    for (const child of (closingChildren ?? stack.slice(index + 1).map(entry => entry.controller)).reverse())
      child.dispose();
    dialog.removeEventListener("cancel", onCancel);
    dialog.removeEventListener("close", onNativeClose);
    dialog.removeEventListener("pointerdown", onPointer);
    dialog.removeEventListener("keydown", onKey);
    if (dialog.open) dialog.close();
    if (index >= 0) stack.splice(index, 1);
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
      const index = stack.findIndex(entry => entry.controller === controller);
      closingChildren = stack.slice(index + 1).map(entry => entry.controller);
      if (options.exit) options.exit(() => finish(true));
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
  if (!dialog.isConnected) doc.body.append(dialog);
  dialog.tabIndex = -1;
  dialog.addEventListener("cancel", onCancel);
  dialog.addEventListener("close", onNativeClose);
  dialog.addEventListener("pointerdown", onPointer);
  dialog.addEventListener("keydown", onKey);
  if (!stack.length) previousOverflow = doc.body.style.overflow;
  dialog.showModal();
  stack.push({ dialog, controller });
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
/** Wait for the panel/scrim transition, with a bounded fallback and immediate reduced motion. */
export function exitLegacyOverlay(root: HTMLElement, finish: () => void) {
  root.classList.remove("open");
  root.classList.add("closing");
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }
  const panel = root.querySelector(".overlay-panel");
  const done = (event?: Event) => {
    if (event && event.target !== root && event.target !== panel) return;
    clearTimeout(timer);
    root.removeEventListener("transitionend", done);
    finish();
  };
  const timer = setTimeout(done, 160);
  root.addEventListener("transitionend", done);
}
/** Compatibility frame keeps old layout classes while using the native lifecycle. */
export function mountLegacyOverlay(
  root: HTMLElement,
  opener: Element | null,
  onClose?: () => void,
): () => void {
  const dialog = document.createElement("dialog");
  dialog.className = "ds-legacy-dialog";
  const panel = root.querySelector<HTMLElement>(".overlay-panel");
  panel?.setAttribute("tabindex", "-1");
  dialog.append(root);
  let frame = 0;
  const controller = openDialog(dialog, {
    opener,
    initialFocus: () =>
      root.querySelector<HTMLElement>("[autofocus],.menu-item") ??
      panel ??
      null,
    exit: (finish) => {
      cancelAnimationFrame(frame);
      exitLegacyOverlay(root, finish);
    },
    onClose: () => {
      dialog.remove();
      onClose?.();
    },
  });
  frame = requestAnimationFrame(() => root.classList.add("open"));
  return controller.close;
}
