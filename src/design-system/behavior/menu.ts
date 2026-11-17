/** Roving focus, disabled/hidden skipping, activation, Home/End and buffered typeahead. */
export function bindMenu(root: HTMLElement, onEscape?: () => void): () => void {
    let search = '', timer: ReturnType<typeof setTimeout> | undefined;
    const items = () => [...root.querySelectorAll<HTMLElement>('[role^="menuitem"]')].filter(el => !el.matches(':disabled,[aria-disabled="true"]') && !el.closest('[hidden]'));
    const prepare = () => { const list = items(); for (const item of list)
        item.tabIndex = item === list[0] ? 0 : -1; };
    prepare();
    const onKey = (event: KeyboardEvent) => {
        const list = items();
        if (!list.length)
            return;
        const index = list.indexOf(root.ownerDocument.activeElement as HTMLElement);
        let next: HTMLElement | undefined;
        if (event.key === 'ArrowDown')
            next = list[(index + 1) % list.length];
        else if (event.key === 'ArrowUp')
            next = index < 0 ? list.at(-1) : list[(index - 1 + list.length) % list.length];
        else if (event.key === 'Home')
            next = list[0];
        else if (event.key === 'End')
            next = list.at(-1);
        else if (event.key === 'Escape') {
            if (onEscape) {
                event.preventDefault();
                event.stopPropagation();
                onEscape();
            }
            return;
        }
        else if (event.key === 'Enter' || event.key === ' ') {
            if (index >= 0) {
                event.preventDefault();
                list[index].click();
            }
            return;
        }
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            search += event.key.toLocaleLowerCase();
            clearTimeout(timer);
            timer = setTimeout(() => search = '', 500);
            next = [...list.slice(index + 1), ...list.slice(0, index + 1)].find(el => el.textContent?.trim().toLocaleLowerCase().startsWith(search));
        }
        if (next) {
            event.preventDefault();
            for (const item of list)
                item.tabIndex = item === next ? 0 : -1;
            next.focus();
        }
    };
    root.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); root.removeEventListener('keydown', onKey); };
}
