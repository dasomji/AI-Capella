/** The single modal lifecycle used by React, DOM and the legacy overlay delegates. */
export type CancelReason = 'escape' | 'outside' | 'button' | 'swipe';
export interface DialogBehaviorOptions {
  opener?: Element | null;
  initialFocus?: HTMLElement | (() => HTMLElement | null);
  escape?: 'close' | 'ignore';
  outside?: 'close' | 'ignore';
  busyCancel?: 'block' | 'allow';
  busy?: boolean;
  onClose?: () => void;
  onCancel?: (reason: CancelReason) => void;
}
export interface DialogController {
  close(): void;
  requestClose(reason?: CancelReason): void;
  setBusy(busy: boolean): void;
}
let current: DialogController | undefined;
export function closeOverlay() { current?.close(); }
const focusable = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])';
function targets(root: HTMLElement) { return [...root.querySelectorAll<HTMLElement>(focusable)].filter(el => !el.closest('[hidden],[inert]') && el.getClientRects().length > 0); }
export function openDialog(dialog: HTMLDialogElement, options: DialogBehaviorOptions = {}): DialogController {
  current?.close();
  const doc = dialog.ownerDocument;
  const previousFocus = options.opener ?? doc.activeElement;
  const saved = new Map<HTMLElement, boolean>();
  const previousOverflow = doc.body.style.overflow;
  const lock = () => { for (const el of [...doc.body.children]) if (el instanceof HTMLElement && el !== dialog && !saved.has(el)) { saved.set(el, !!el.inert); el.inert = true; } };
  let closed = false, busy = options.busy ?? false;
  const controller: DialogController = {
    setBusy(value) { busy = value; dialog.setAttribute('aria-busy',String(value)); },
    requestClose(reason='button') {
      if ((busy && options.busyCancel !== 'allow') || (reason === 'escape' && options.escape === 'ignore') || (reason === 'outside' && options.outside === 'ignore')) return;
      options.onCancel?.(reason); controller.close();
    },
    close() {
      if (closed) return;
      closed = true;
      observer.disconnect();
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onNativeClose);
      dialog.removeEventListener('pointerdown', onPointer);
      dialog.removeEventListener('keydown', onKey);
      if (dialog.open) dialog.close();
      for (const [el, value] of saved) el.inert = value;
      doc.body.style.overflow = previousOverflow;
      if (current === controller) current = undefined;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({preventScroll:true});
      options.onClose?.();
    },
  };
  const onCancel = (event: Event) => { event.preventDefault(); controller.requestClose('escape'); };
  const onNativeClose = () => controller.close();
  const onPointer = (event: PointerEvent) => {
    // A native backdrop retargets to the dialog; legacy frames contain their own scrim.
    const panel = dialog.querySelector<HTMLElement>('[data-dialog-panel],.overlay-panel') ?? dialog;
    const rect = panel.getBoundingClientRect();
    if (!panel.contains(event.target as Node) || (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom))) controller.requestClose('outside');
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); controller.requestClose('escape'); }
    if (event.key === 'Tab') {
      const elements = targets(dialog), first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (doc.activeElement === first || !dialog.contains(doc.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (doc.activeElement === last || !dialog.contains(doc.activeElement))) { event.preventDefault(); first.focus(); }
    }
  };
  const observer = new MutationObserver(lock);
  if (!dialog.isConnected) doc.body.append(dialog);
  dialog.tabIndex = -1;
  dialog.addEventListener('cancel',onCancel);
  dialog.addEventListener('close',onNativeClose);
  dialog.addEventListener('pointerdown',onPointer);
  dialog.addEventListener('keydown',onKey);
  dialog.showModal();
  lock(); observer.observe(doc.body,{childList:true});
  doc.body.style.overflow = 'hidden';
  current = controller;
  controller.setBusy(busy);
  const initial = typeof options.initialFocus === 'function' ? options.initialFocus() : options.initialFocus;
  (initial ?? dialog.querySelector<HTMLElement>('[autofocus]') ?? targets(dialog)[0] ?? dialog).focus({preventScroll:true});
  return controller;
}
/** Compatibility frame keeps old layout classes while using the native lifecycle. */
export function mountLegacyOverlay(root: HTMLElement, opener: Element | null, onClose?: () => void): () => void {
  const dialog = document.createElement('dialog');
  dialog.className = 'ds-legacy-dialog';
  const panel = root.querySelector<HTMLElement>('.overlay-panel');
  panel?.setAttribute('tabindex','-1');
  dialog.append(root);
  let frame = 0;
  const controller = openDialog(dialog, {opener, initialFocus:() => root.querySelector<HTMLElement>('[autofocus],.menu-item') ?? panel ?? null, onClose:() => {
    cancelAnimationFrame(frame);
    root.classList.remove('open'); root.classList.add('closing');
    dialog.remove(); onClose?.();
  }});
  frame = requestAnimationFrame(() => root.classList.add('open'));
  return controller.close;
}
