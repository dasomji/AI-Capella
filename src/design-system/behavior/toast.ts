import { getActiveDialog } from './dialog';
import { toastRecipe, type ToastOptions } from '../recipes';
export interface ToastMessage {
    text: string;
    kind: NonNullable<ToastOptions['kind']>;
    id: number;
}
let message: ToastMessage | null = null;
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
export function subscribeToast(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getToast() { return message; }
export function dismissToast() { clearTimeout(timer); message = null; render(); listeners.forEach(fn => fn()); }
/** Lazily created singleton. React ToastHost observes this same host, never duplicates it. */
function render() {
    if (typeof document === 'undefined')
        return;
    let host = document.getElementById('toast');
    if (!host && !message)
        return;
    if (!host) {
        host = document.createElement('div');
        host.id = 'toast';
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        host.setAttribute('aria-atomic', 'true');
        document.body.append(host);
    }
    let activeDialog=getActiveDialog();
    if(!activeDialog) { try { activeDialog=document.querySelector<HTMLDialogElement>('dialog:modal')??undefined; } catch { /* DOM test engines may not implement :modal. */ } }
    const parent = activeDialog ?? document.body;
    if (host.parentElement !== parent)
        parent.append(host);
    host.inert = false;
    host.textContent = message?.text ?? '';
    // Legacy placement and appearance remain until P4/P5 migrate the screens.
    host.className = toastRecipe({ kind: message?.kind, variant: 'legacy' }) + (message ? ' show' : '');
}
export function toast(text: string, kind: ToastMessage['kind'] = 'info') {
    clearTimeout(timer);
    message = { text, kind, id: ++sequence };
    render();
    listeners.forEach(fn => fn());
    timer = setTimeout(dismissToast, kind === 'error' ? 6500 : 3200);
}
