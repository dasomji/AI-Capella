import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes, ReactNode, Ref } from 'react';
import * as r from '../recipes';
import { openDialog, bindMenu, subscribeToast, getToast, type DialogBehaviorOptions } from '../behavior';
export { toast } from '../behavior';
type Native<T> = Omit<T, 'className' | 'style'> & {
    layout?: r.LayoutClass;
};
export type ButtonProps = Native<ButtonHTMLAttributes<HTMLButtonElement>> & r.ButtonOptions & {
    busy?: boolean;
    ref?: Ref<HTMLButtonElement>;
};
export function Button({ variant, intent, pressed, busy = false, layout, type = 'button', onClick, ref, ...props }: ButtonProps) {
    return <button {...props} ref={ref} type={type} data-ds="button" className={r.withLayout(r.buttonRecipe({ variant, intent, pressed }), layout)} aria-pressed={pressed ?? props['aria-pressed']} aria-busy={busy} aria-disabled={busy || props['aria-disabled'] || undefined} onClick={event => { if (busy || props['aria-disabled'] === true || props['aria-disabled'] === 'true') {
        event.preventDefault();
        event.stopPropagation();
        return;
    } onClick?.(event); }}/>;
}
export type IconButtonProps = Omit<ButtonProps, 'variant'> & r.IconButtonOptions & {
    label: string;
};
export function IconButton({ variant, label, layout, busy = false, type = 'button', onClick, pressed, ...props }: IconButtonProps) { return <button {...props} type={type} data-ds="icon-button" className={r.withLayout(r.iconButtonRecipe({ variant }), layout)} aria-label={label} aria-pressed={pressed ?? props['aria-pressed']} aria-busy={busy} aria-disabled={busy || props['aria-disabled'] || undefined} onClick={event => { if (busy || props['aria-disabled'] === true || props['aria-disabled'] === 'true') {
    event.preventDefault();
    event.stopPropagation();
    return;
} onClick?.(event); }}/>; }
export type InputProps = Native<InputHTMLAttributes<HTMLInputElement>> & r.FieldOptions & {
    ref?: Ref<HTMLInputElement>;
};
export function Input({ variant, invalid, layout, ...props }: InputProps) { invalid=invalid??(props['aria-invalid']===true||props['aria-invalid']==='true'||props['aria-invalid']==='grammar'||props['aria-invalid']==='spelling'); return <input {...props} data-ds="input" aria-invalid={invalid || props['aria-invalid'] || undefined} className={r.withLayout(r.inputRecipe({ variant, invalid }), layout)}/>; }
export type SelectProps = Native<SelectHTMLAttributes<HTMLSelectElement>> & r.FieldOptions & {
    ref?: Ref<HTMLSelectElement>;
};
export function Select({ variant, invalid, layout, ...props }: SelectProps) { invalid=invalid??(props['aria-invalid']===true||props['aria-invalid']==='true'||props['aria-invalid']==='grammar'||props['aria-invalid']==='spelling'); return <select {...props} data-ds="select" aria-invalid={invalid || props['aria-invalid'] || undefined} className={r.withLayout(r.selectRecipe({ variant, invalid }), layout)}/>; }
export type TextareaProps = Native<TextareaHTMLAttributes<HTMLTextAreaElement>> & r.FieldOptions & {
    ref?: Ref<HTMLTextAreaElement>;
};
export function Textarea({ variant, invalid, layout, ...props }: TextareaProps) { invalid=invalid??(props['aria-invalid']===true||props['aria-invalid']==='true'||props['aria-invalid']==='grammar'||props['aria-invalid']==='spelling'); return <textarea {...props} data-ds="textarea" aria-invalid={invalid || props['aria-invalid'] || undefined} className={r.withLayout(r.textareaRecipe({ variant, invalid }), layout)}/>; }
export interface FieldControlProps {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
}
export interface FieldProps extends r.FieldOptions {
    label: string;
    hint?: string;
    error?: string;
    id?: string;
    describedBy?: string;
    children: (props: FieldControlProps) => ReactNode;
    layout?: r.LayoutClass;
}
/** Render prop associates any native control without cloning or intercepting validation. */
export function Field({ label, hint, error, id, describedBy, children, variant, invalid, layout }: FieldProps) { const generated = useId(); const controlId = id ?? generated; const slots = r.fieldRecipe({ variant, invalid: !!error || invalid }); const description = [describedBy, hint ? controlId + '-hint' : undefined, error ? controlId + '-error' : undefined].filter(Boolean).join(' ') || undefined; return <div data-ds="field" className={r.withLayout(slots.root, layout)}><label htmlFor={controlId} className={slots.label}>{label}</label>{children({ id: controlId, 'aria-describedby': description, 'aria-invalid': !!error || invalid || undefined })}{hint && <p id={controlId + '-hint'} className={slots.hint}>{hint}</p>}{error && <p id={controlId + '-error'} className={slots.error}>{error}</p>}</div>; }
export type CheckboxProps = Native<Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'>> & r.CheckboxOptions & {
    label: ReactNode;
};
export function Checkbox({ variant, label, layout, ...props }: CheckboxProps) { const slots = r.checkboxRecipe({ variant }); return <label className={r.withLayout(slots.root, layout)}><input {...props} type="checkbox" data-ds="checkbox" className={slots.control}/><span>{label}</span></label>; }
export type SwitchProps = Native<Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>> & r.SwitchOptions & {
    label: string;
    mode?: 'button' | 'checkbox';
    name?: string;
    busy?: boolean;
    onChange?: (value: boolean) => void;
};
export function Switch({ variant, checked = false, label, layout, busy = false, onChange, onClick, mode = 'button', name, ...props }: SwitchProps) {
    const slots = r.switchRecipe({ variant, checked });
    if (mode === 'checkbox')
        return <label className={r.withLayout(slots.label, layout)}><input {...props as InputHTMLAttributes<HTMLInputElement>} name={name} type="checkbox" role="switch" className={slots.input} aria-label={label} aria-busy={busy} aria-disabled={busy || undefined} checked={checked} disabled={props.disabled} onClick={event => { if (busy) {
            event.preventDefault();
            event.stopPropagation();
        } }} onChange={event => onChange?.(event.target.checked)}/><span aria-hidden="true" className={slots.root}><span className={slots.thumb}/></span><span>{label}</span></label>;
    return <button {...props} type="button" role="switch" data-ds="switch" aria-label={label} aria-checked={checked} aria-busy={busy} aria-disabled={busy || props['aria-disabled'] || undefined} className={r.withLayout(slots.root, layout)} onClick={event => { if (busy || props['aria-disabled']) {
        event.preventDefault();
        event.stopPropagation();
        return;
    } onClick?.(event); if (!event.defaultPrevented)
        onChange?.(!checked); }}><span aria-hidden="true" className={slots.thumb}/></button>;
}
export function Card({ variant, layout, ...props }: Native<HTMLAttributes<HTMLElement>> & r.CardOptions) { return <article {...props} className={r.withLayout(r.cardRecipe({ variant }), layout)}/>; }
export const Surface = Card;
export function Badge({ intent, layout, ...props }: Native<HTMLAttributes<HTMLSpanElement>> & r.FeedbackOptions) { return <span {...props} className={r.withLayout(r.badgeRecipe({ intent }), layout)}/>; }
export function Toolbar({ label, layout, ...props }: Native<HTMLAttributes<HTMLDivElement>> & {
    label: string;
}) { return <div {...props} role="toolbar" aria-label={label} className={r.withLayout(r.toolbarRecipe(), layout)}/>; }
export function Status({ intent, layout, ...props }: Native<HTMLAttributes<HTMLParagraphElement>> & r.FeedbackOptions) { return <p {...props} role="status" className={r.withLayout(r.statusRecipe({ intent }), layout)}/>; }
export function Loading({ layout, ...props }: Native<HTMLAttributes<HTMLParagraphElement>>) { return <p {...props} role="status" aria-busy="true" className={r.withLayout(r.loadingRecipe(), layout)}/>; }
export function EmptyState({ variant, title, body, action, layout }: r.EmptyStateOptions & {
    title: string;
    body?: ReactNode;
    action?: ReactNode;
    layout?: r.LayoutClass;
}) { const slots = r.emptyStateRecipe({ variant }); return <section className={r.withLayout(slots.root, layout)}><h3 className={slots.title}>{title}</h3>{body && <p className={slots.body}>{body}</p>}{action && <div className={slots.actions}>{action}</div>}</section>; }
export interface ToggleGroupProps extends r.ToggleGroupOptions {
    label: string;
    items: readonly {
        value: string;
        label: string;
        disabled?: boolean;
    }[];
    value: string;
    onChange?: (value: string) => void;
    layout?: r.LayoutClass;
}
export function ToggleGroup({ variant, label, items, value, onChange, layout }: ToggleGroupProps) { const slots = r.toggleGroupRecipe({ variant }); return <div role="group" aria-label={label} className={r.withLayout(slots.root, layout)}>{items.map(item => <button type="button" key={item.value} disabled={item.disabled} aria-pressed={value === item.value} className={slots.item(value === item.value)} onClick={() => onChange?.(item.value)}>{item.label}</button>)}</div>; }
export interface DialogProps extends r.DialogOptions {
    open: boolean;
    title: string;
    body?: ReactNode;
    children?: ReactNode;
    actions?: ReactNode;
    behavior?: DialogBehaviorOptions;
    onClose?: () => void; /** Static, nonmodal specimen for showcase only. */
    specimen?: boolean;
}
export function Dialog({ variant, open, title, body, children, actions, behavior, onClose, specimen = false }: DialogProps) {
    const ref = useRef<HTMLDialogElement>(null);
    const latest = useRef({ behavior, onClose });
    latest.current = { behavior, onClose };
    const controller = useRef<ReturnType<typeof openDialog> | undefined>(undefined);
    useEffect(() => { if (!open || specimen || !ref.current)
        return; controller.current = openDialog(ref.current, { ...latest.current.behavior, onClose: () => { latest.current.behavior?.onClose?.(); latest.current.onClose?.(); } }); return () => controller.current?.close(); }, [open, specimen]);
    useEffect(() => controller.current?.setBusy(!!behavior?.busy), [behavior?.busy]);
    const slots = r.dialogRecipe({ variant });
    return <dialog ref={ref} open={specimen ? open : undefined} data-ds="dialog" aria-label={title} className={slots.panel}><div className={slots.content}><header className={slots.header}><h2 className={slots.title}>{title}</h2></header>{body && <p className={slots.body}>{body}</p>}{children}{actions && <div className={slots.actions}>{actions}</div>}</div></dialog>;
}
export const Sheet = (props: Omit<DialogProps, 'variant'>) => <Dialog {...props} variant="sheet"/>;
export const Drawer = (props: Omit<DialogProps, 'variant'>) => <Dialog {...props} variant="drawer"/>;
export const ConfirmDialog = (props: Omit<DialogProps, 'variant'>) => <Dialog {...props} variant="confirm"/>;
export interface MenuProps extends r.MenuOptions {
    label: string;
    items: readonly {
        label: string;
        disabled?: boolean;
        checked?: boolean;
        danger?: boolean;
        onSelect: () => void;
    }[];
    onEscape?: () => void;
}
export function Menu({ variant, label, items, onEscape }: MenuProps) { const ref = useRef<HTMLDivElement>(null); useEffect(() => ref.current ? bindMenu(ref.current, onEscape) : undefined, [items, onEscape]); const slots = r.menuRecipe({ variant }); return <div ref={ref} role="menu" aria-label={label} className={slots.root}>{items.map((item, index) => <button key={index} type="button" data-ds="menu-item" disabled={item.disabled} role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={item.checked} className={slots.item + (item.danger ? ' ' + slots.danger : '')} onClick={item.onSelect}>{item.label}{item.checked && <span aria-hidden="true" className={slots.check}>✓</span>}</button>)}</div>; }
export function ToastHost() { useSyncExternalStore(subscribeToast, getToast, () => null); return null; }
export function Toast({ kind, children }: r.ToastOptions & {
    children: ReactNode;
}) { return <div role="status" aria-live="polite" className={r.toastRecipe({ kind })}>{children}</div>; }
export function Table({ variant, layout, ...props }: Native<HTMLAttributes<HTMLTableElement>> & r.TableOptions) { return <table {...props} className={r.withLayout(r.tableRecipe({ variant }).root, layout)}/>; }
export function TableHeader({ variant, layout, ...props }: Native<ThHTMLAttributes<HTMLTableCellElement>> & r.TableOptions) { return <th {...props} className={r.withLayout(r.tableRecipe({ variant }).header, layout)}/>; }
export function TableCell({ variant, layout, ...props }: Native<TdHTMLAttributes<HTMLTableCellElement>> & r.TableOptions) { return <td {...props} className={r.withLayout(r.tableRecipe({ variant }).cell, layout)}/>; }
export function TableRow({ variant, layout, ...props }: Native<HTMLAttributes<HTMLTableRowElement>> & r.TableOptions) { return <tr {...props} className={r.withLayout(r.tableRecipe({ variant }).row, layout)}/>; }
export function TableEmpty({ variant, layout, ...props }: Native<TdHTMLAttributes<HTMLTableCellElement>> & r.TableOptions) { return <td {...props} className={r.withLayout(r.tableRecipe({ variant }).empty, layout)}/>; }
export function TablePagination({ variant, layout, ...props }: Native<HTMLAttributes<HTMLDivElement>> & r.TableOptions) { return <div {...props} className={r.withLayout(r.tableRecipe({ variant }).pagination, layout)}/>; }
export function TableWrap({ variant, layout, ...props }: Native<HTMLAttributes<HTMLDivElement>> & r.TableOptions) { return <div {...props} className={r.withLayout(r.tableRecipe({ variant }).wrap, layout)}/>; }
