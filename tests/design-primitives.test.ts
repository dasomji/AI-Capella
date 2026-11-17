// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import * as D from '../src/design-system/dom';
import * as R from '../src/design-system/react';
import { openDialog, bindMenu, toast, getToast, dismissToast, subscribeToast } from '../src/design-system/behavior';
afterEach(() => { D.closeOverlay(); dismissToast(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('DOM and React adapter contracts', () => {
    it('defaults to button, treats user text as text, forwards hooks and guards busy without losing focus', () => { const onClick = vi.fn(), button = D.createButton({ text: '<img src=x onerror=x>', busy: true, onClick, attrs: { 'data-action': 'save', 'aria-label': 'Save' } }); document.body.append(button); button.focus(); button.click(); expect(button.type).toBe('button'); expect(button.querySelector('img')).toBeNull(); expect(button.disabled).toBe(false); expect(button.getAttribute('aria-disabled')).toBe('true'); expect(document.activeElement).toBe(button); expect(onClick).not.toHaveBeenCalled(); D.updateButton(button, { busy: false, variant: 'pill' }); button.click(); expect(onClick).toHaveBeenCalledOnce(); expect(button.dataset.action).toBe('save'); const html = renderToString(createElement(R.Button, { busy: true }, 'Save')); expect(html).toContain('type="button"'); expect(html).toContain('aria-disabled="true"'); expect(html).not.toContain(' disabled='); });
    it('preserves native validation and associates label, hint and error IDs', () => { const input = D.createInput({ required: true, type: 'email', attrs: { 'aria-describedby': 'external' } }); const field = D.createField({ label: 'Email', hint: 'Hint', error: 'Invalid', control: input }); document.body.append(field); expect(field.querySelector('label')?.htmlFor).toBe(input.id); expect(input.getAttribute('aria-describedby')).toBe(`external ${input.id}-hint ${input.id}-error`); expect(input.getAttribute('aria-invalid')).toBe('true'); expect(input.checkValidity()).toBe(false); });
    it('keeps checkbox form semantics and switch command semantics', () => { const checkbox = D.createCheckbox({ label: 'Permission', checked: true, name: 'permission' }); expect(checkbox.querySelector('input')?.type).toBe('checkbox'); expect(checkbox.querySelector('input')?.checked).toBe(true); const onChange = vi.fn(); const control = D.createSwitch({ label: 'Enabled', checked: true, onChange }); control.click(); expect(control.getAttribute('role')).toBe('switch'); expect(onChange).toHaveBeenCalledWith(false); });
});
function modal(options: Parameters<typeof openDialog>[1] = {}) {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const dialog = document.createElement('dialog');
    dialog.innerHTML = '<button autofocus>First</button><button>Last</button>';
    Object.defineProperty(dialog, 'showModal', { value: () => dialog.open = true });
    Object.defineProperty(dialog, 'close', { value: () => { dialog.open = false; dialog.dispatchEvent(new Event('close')); } });
    const api = openDialog(dialog, options);
    return { opener, dialog, api };
}
describe('native switch mode', () => {
    it('preserves form submission and guards busy checkbox activation', () => {
        const changed = vi.fn(), control = D.createSwitch({ mode: 'checkbox', variant: 'capability', label: 'Permission', checked: true, name: 'permission', busy: true, onChange: changed });
        document.body.append(control);
        const input = control.querySelector('input')!;
        input.click();
        expect(input.checked).toBe(true);
        D.updateSwitch(control, { label: 'Permission', mode: 'checkbox', variant: 'capability', checked: false, busy: false });
        expect(input.checked).toBe(false);
        expect(input.name).toBe('permission');
        expect(input.getAttribute('role')).toBe('switch');
        expect(changed).not.toHaveBeenCalled();
    });
});
describe('one native dialog lifecycle', () => {
    it('focuses initially, restores focus/inert/scroll and closes idempotently', () => { const close = vi.fn(); const old = document.createElement('div'); old.inert = true; document.body.append(old); document.body.style.overflow = 'auto'; const { opener, dialog, api } = modal({ onClose: close }); expect(dialog.open).toBe(true); expect(opener.inert).toBe(true); expect(document.activeElement).toBe(dialog.firstElementChild); expect(document.body.style.overflow).toBe('hidden'); api.close(); api.close(); expect(close).toHaveBeenCalledOnce(); expect(document.activeElement).toBe(opener); expect(opener.inert).toBe(false); expect(old.inert).toBe(true); expect(document.body.style.overflow).toBe('auto'); });
    it('blocks busy cancellation for Escape/outside/button and allows explicit completion', () => { const { dialog, api } = modal({ busy: true }); dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); api.requestClose('outside'); api.requestClose('button'); expect(dialog.open).toBe(true); api.setBusy(false); dialog.dispatchEvent(new Event('cancel', { cancelable: true })); expect(dialog.open).toBe(false); });
    it('supports ignore and allow policies plus native close cleanup', () => { const first = modal({ escape: 'ignore', outside: 'ignore' }); first.api.requestClose('escape'); first.api.requestClose('outside'); expect(first.dialog.open).toBe(true); first.dialog.close(); expect(first.opener.inert).toBe(false); const second = modal({ busy: true, busyCancel: 'allow' }); second.api.requestClose(); expect(second.dialog.open).toBe(false); });
    it('makes later body siblings inert and restores them on unmount', async () => { const { api } = modal(); const added = document.createElement('div'); document.body.append(added); await Promise.resolve(); expect(added.inert).toBe(true); api.close(); expect(added.inert).toBeFalsy(); });
});
describe('menu keyboard and shared notifier', () => {
    it('skips disabled and collapsed items, wraps, Home/End, typeahead and activation', () => { const selected = vi.fn(); const { element, dispose } = D.createMenu({ label: 'Actions', items: [{ label: 'Alpha', onSelect: selected }, { label: 'Disabled', disabled: true, onSelect: selected }, { label: 'Beta', onSelect: selected }, { label: 'Charlie', onSelect: selected }] }); document.body.append(element); const buttons = element.querySelectorAll('button'); buttons[0].focus(); const key = (key: string) => element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); key('ArrowDown'); expect(document.activeElement).toBe(buttons[2]); key('End'); expect(document.activeElement).toBe(buttons[3]); key('ArrowDown'); expect(document.activeElement).toBe(buttons[0]); key('c'); expect(document.activeElement).toBe(buttons[3]); key('Home'); key('Enter'); expect(selected).toHaveBeenCalledOnce(); dispose(); });
    it('ArrowUp enters at the last item and handled Escape does not cancel a parent dialog', () => { const root = document.createElement('div'); root.innerHTML = '<button role="menuitem">Alpha</button><button role="menuitem">Beta</button>'; root.tabIndex = 0; document.body.append(root); const parent = vi.fn(); document.body.addEventListener('keydown', parent); const escape = vi.fn(), dispose = bindMenu(root, escape); root.focus(); root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); expect(document.activeElement).toBe(root.lastElementChild); parent.mockClear(); root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); expect(escape).toHaveBeenCalledOnce(); expect(parent).not.toHaveBeenCalled(); dispose(); document.body.removeEventListener('keydown', parent); });
    it('cleans menu listeners and typeahead timers', () => { const root = document.createElement('div'); root.innerHTML = '<button role="menuitem">Alpha</button>'; const escape = vi.fn(), dispose = bindMenu(root, escape); dispose(); root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); expect(escape).not.toHaveBeenCalled(); });
    it('moves an existing inert toast into the active modal for accessible announcements', () => { toast('First'); const host = document.getElementById('toast')!; const { dialog } = modal(); expect(host.inert).toBe(true); toast('In modal'); expect(host.parentElement).toBe(dialog); expect(host.inert).toBe(false); });
    it('uses one safe host, replaces messages, restarts duration and notifies both consumers', () => { vi.useFakeTimers(); const listener = vi.fn(), unsubscribe = subscribeToast(listener); toast('<b>First</b>'); expect(document.querySelectorAll('#toast')).toHaveLength(1); expect(document.querySelector('#toast b')).toBeNull(); vi.advanceTimersByTime(3000); toast('Error', 'error'); vi.advanceTimersByTime(3200); expect(getToast()?.text).toBe('Error'); expect(document.querySelectorAll('#toast')).toHaveLength(1); vi.advanceTimersByTime(3300); expect(getToast()).toBeNull(); expect(listener).toHaveBeenCalledTimes(3); unsubscribe(); });
});
