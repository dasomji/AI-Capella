import { swipeToDismiss } from "../behavior/sheet";
/** Legacy composition hooks retained for P4/P5; lifecycle and feedback are shared. */
import { matchBreakpoint } from '../theme';
import { icon, type IconName } from '../../icons';
import { t } from '../../i18n';
import { closeOverlay, mountLegacyOverlay as mount } from '../behavior/dialog';
import { bindMenu } from '../behavior/menu';
export { closeOverlay } from '../behavior/dialog';
export { toast } from '../behavior/toast';
export function isNarrow(): boolean { return matchBreakpoint('panel','below').matches; }
export interface MenuItem {
  label: string;
  icon?: IconName;
  // A sign from the music font (Bravura) shown in place of the icon: a clef, say.
  glyph?: { text: string; kind: string };
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  onSelect: () => void;
  // A choice that opens in place: the item shows the chosen one (`value`) and, clicked, its
  // `options` below it; the menu stays open until one of them is picked.
  options?: MenuItem[];
  value?: string;
}

/** A dropdown menu anchored to `anchor` (a bottom sheet on narrow screens). */
export function openMenu(anchor: HTMLElement, items: MenuItem[], title?: string) {
  const list = document.createElement('div');
  list.className = 'menu-list';
  list.setAttribute('role', 'menu');
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.disabled = !!item.disabled;
    btn.className = 'menu-item' + (item.danger ? ' danger' : '');
    btn.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemradio');
    if (item.checked !== undefined) btn.setAttribute('aria-checked', String(item.checked));
    if (item.glyph) {
      const glyph = document.createElement('span');
      glyph.className = `ic glyph glyph-${item.glyph.kind}`;
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = item.glyph.text;
      btn.appendChild(glyph);
    } else btn.innerHTML = item.icon ? icon(item.icon) : '<span class="ic"></span>';
    const label = document.createElement('span');
    label.textContent = item.label;
    btn.appendChild(label);
    if (item.checked) btn.insertAdjacentHTML('beforeend', '<span class="menu-check" aria-hidden="true">✓</span>');
    if (item.options) {
      const value = document.createElement('span');
      value.className = 'menu-value';
      value.textContent = item.value ?? '';
      btn.append(value);
      btn.insertAdjacentHTML('beforeend', icon('chevronDown', 'ic menu-chevron'));
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-haspopup', 'true');
      const sub = document.createElement('div');
      sub.className = 'menu-sub';
      sub.setAttribute('role', 'group');
      sub.setAttribute('aria-label', item.label);
      sub.hidden = true;
      for (const option of item.options) {
        const o = document.createElement('button');
        o.type = 'button';
        o.disabled = !!option.disabled;
        o.className = 'menu-item menu-option';
        o.setAttribute('role', 'menuitemradio');
        o.setAttribute('aria-checked', String(!!option.checked));
        o.innerHTML = '<span class="ic"></span>';
        const l = document.createElement('span');
        l.textContent = option.label;
        o.appendChild(l);
        if (option.checked) o.insertAdjacentHTML('beforeend', '<span class="menu-check" aria-hidden="true">✓</span>');
        o.addEventListener('click', () => {
          closeOverlay();
          option.onSelect();
        });
        sub.appendChild(o);
      }
      btn.addEventListener('click', () => {
        sub.hidden = !sub.hidden;
        btn.setAttribute('aria-expanded', String(!sub.hidden));
        if (!sub.hidden) sub.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
      });
      list.append(btn, sub);
      continue;
    }
    btn.addEventListener('click', () => {
      closeOverlay();
      item.onSelect();
    });
    list.appendChild(btn);
  }
  bindMenu(list, closeOverlay);
  if (isNarrow()) openSheet(title ?? '', list, anchor);
  else openPopover(anchor, list, 'end');
}

/** A floating panel next to `anchor`, kept inside the viewport. */
export function openPopover(anchor: HTMLElement, content: HTMLElement, align: 'start' | 'center' | 'end' = 'center') {
  const root = document.createElement('div');
  root.className = 'overlay popover-root';
  const panel = document.createElement('div');
  panel.className = 'overlay-panel popover';
  panel.appendChild(content);
  root.appendChild(panel);
  const close = mount(root, anchor);
  const place = () => {
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    let left = align === 'start' ? a.left : align === 'end' ? a.right - p.width : a.left + a.width / 2 - p.width / 2;
    left = Math.max(8, Math.min(window.innerWidth - p.width - 8, left));
    const below = a.bottom + 8;
    const top = below + p.height > window.innerHeight - 8 ? a.top - p.height - 8 : below;
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(8, top)}px`;
  };
  place();
  requestAnimationFrame(place);
  return close;
}

/** A bottom sheet with a grabber and title -- the phone's home for secondary controls. */
export function openSheet(title: string, content: HTMLElement, opener?: Element | null, onClose?: () => void) {
  const root = document.createElement('div');
  root.className = 'overlay sheet-root';
  const panel = document.createElement('div');
  panel.className = 'overlay-panel sheet';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const head = document.createElement('div');
  head.className = 'sheet-head';
  head.innerHTML = `<span class="sheet-grab" aria-hidden="true"></span>`;
  if (title) {
    const h = document.createElement('h2');
    h.textContent = title;
    head.appendChild(h);
    panel.setAttribute('aria-label', title);
  }
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'icon-btn overlay-close';
  closeBtn.setAttribute('aria-label', t('close'));
  closeBtn.innerHTML = icon('close');
  head.appendChild(closeBtn);
  panel.append(head, content);
  root.appendChild(panel);
  const close = mount(root, opener ?? null, onClose);
  closeBtn.addEventListener('click', close);
  swipeToDismiss(panel, close);
  return close;
}

interface DialogOptions {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  input?: { value: string; label: string };
}

function dialog(o: DialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'overlay dialog-root';
    const panel = document.createElement('form');
    panel.className = 'overlay-panel dialog';
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-modal', 'true');
    const h = document.createElement('h2');
    h.textContent = o.title;
    panel.appendChild(h);
    if (o.body) {
      const p = document.createElement('p');
      p.textContent = o.body;
      panel.appendChild(p);
    }
    let input: HTMLInputElement | null = null;
    if (o.input) {
      input = document.createElement('input');
      input.className = 'field';
      input.value = o.input.value;
      input.setAttribute('aria-label', o.input.label);
      input.autofocus = true;
      panel.appendChild(input);
    }
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = t('cancel');
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'btn ' + (o.danger ? 'danger' : 'primary');
    ok.textContent = o.confirmLabel;
    if (!o.input) ok.autofocus = true;
    actions.append(cancel, ok);
    panel.appendChild(actions);
    root.appendChild(panel);
    let result: string | null = null;
    const close = mount(root, null, () => resolve(result));
    cancel.addEventListener('click', close);
    panel.addEventListener('submit', (e) => {
      e.preventDefault();
      result = input ? input.value.trim() : 'ok';
      close();
    });
    requestAnimationFrame(() => input?.select());
  });
}

export async function confirmDialog(o: Omit<DialogOptions, 'input'>): Promise<boolean> {
  return (await dialog(o)) === 'ok';
}

export async function promptDialog(title: string, value: string, confirmLabel: string): Promise<string | null> {
  const result = await dialog({ title, confirmLabel, input: { value, label: title } });
  return result && result !== value ? result : null;
}

