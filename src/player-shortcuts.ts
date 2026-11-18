// These widgets own editing, selection, navigation or typeahead. Buttons/links
// are handled separately so rehearsal shortcuts still work after clicking them.
const widgetRoles = new Set([
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'checkbox', 'switch', 'radio', 'radiogroup', 'textbox', 'searchbox',
  'combobox', 'listbox', 'option', 'slider', 'spinbutton', 'scrollbar',
  'tab', 'tablist', 'tree', 'treeitem', 'treegrid', 'grid', 'gridcell',
  'row', 'rowheader', 'columnheader', 'toolbar', 'separator', 'application',
]);
const layerSelector = 'dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [role="menubar"], .overlay';

/** Whether a global player shortcut may own this event, before any side effects. */
export function shouldHandlePlayerShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return false;
  const space = event.code === 'Space' || event.key === ' ';
  if (!space && !['ArrowLeft', 'ArrowRight', 'l', 'L', 'm', 'M', 'f', 'F'].includes(event.key)) return false;

  const target = event.target instanceof Element ? event.target : null;
  const doc = target?.ownerDocument ?? document;
  // Modal ownership applies even to events dispatched on window or background nodes.
  if (doc.querySelector('dialog[open], [aria-modal="true"]:not([hidden]):not([aria-hidden="true"]), .overlay')) return false;

  // composedPath retains the originating control when a shadow root retargets it.
  const elements = event.composedPath().filter((node): node is Element => node instanceof Element);
  if (!elements.length && target) elements.push(target);
  const ancestors = new Set<Element>();
  for (const element of elements) {
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.add(node);
  }
  for (const node of ancestors) {
    if (node.matches('input, textarea, select, audio[controls], video[controls]') || (node instanceof HTMLElement && node.isContentEditable)) return false;
    // Attribute fallback also covers DOM environments without isContentEditable.
    const editable = node.closest('[contenteditable]');
    if (editable && editable.getAttribute('contenteditable')?.toLowerCase() !== 'false') return false;
    if (node.matches(layerSelector)) return false;
    // A popover without an ARIA role still owns keys while in the top layer.
    if (node.hasAttribute('popover') && typeof (node as HTMLElement).showPopover === 'function' && node.matches(':popover-open')) return false;
    const roles = (node.getAttribute('role') ?? '').split(/\s+/);
    if (roles.some(role => widgetRoles.has(role))) return false;
    if (space && (node.matches('button, a[href], summary') || roles.some(role => role === 'button' || role === 'link'))) return false;
  }
  return true;
}
