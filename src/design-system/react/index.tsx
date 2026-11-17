import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  HTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
  ReactNode,
  Ref,
} from "react";
import { createPortal } from "react-dom";
import * as r from "../recipes";
import * as p from "../parts";
import { openDialog, bindMenu, type DialogBehaviorOptions } from "../behavior";
export { toast } from "../behavior";
type Native<T> = Omit<T, "className" | "style"> & {
  layout?: r.LayoutClass;
} & { [key: `data-${string}`]: string | number | boolean | undefined };
export type ButtonProps = Native<ButtonHTMLAttributes<HTMLButtonElement>> &
  r.ButtonOptions & {
    busy?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };
export function Button({
  variant,
  intent,
  pressed,
  busy = false,
  layout,
  type = "button",
  onClick,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      ref={ref}
      {...p.buttonPart({
        variant,
        intent,
        pressed,
        busy,
        disabled: props.disabled,
        layout,
      })}
      type={type}
      aria-pressed={pressed ?? props["aria-pressed"]}
      aria-busy={busy}
      aria-disabled={busy || props["aria-disabled"] || undefined}
      onClick={(event) => {
        if (
          busy ||
          props["aria-disabled"] === true ||
          props["aria-disabled"] === "true"
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}
export type IconButtonProps = Omit<ButtonProps, "variant"> &
  r.IconButtonOptions & {
    label: string;
  };
export function IconButton({
  variant,
  label,
  layout,
  busy = false,
  type = "button",
  onClick,
  pressed,
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      {...p.buttonPart({
        icon: { variant },
        pressed,
        busy,
        disabled: props.disabled,
        layout,
      })}
      type={type}
      aria-label={label}
      aria-pressed={pressed ?? props["aria-pressed"]}
      aria-busy={busy}
      aria-disabled={busy || props["aria-disabled"] || undefined}
      onClick={(event) => {
        if (
          busy ||
          props["aria-disabled"] === true ||
          props["aria-disabled"] === "true"
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}
/** Keeps control actions positioned without a screen-owned styling wrapper. */
export function ControlGroup({ layout, ...props }: Native<HTMLAttributes<HTMLSpanElement>>) {
  return <span {...props} data-ds="control-group" className={r.withLayout(r.controlGroupRecipe(), layout)} />;
}
const FieldVariant = createContext<r.FieldVariant | undefined>(undefined);
export type InputProps = Native<InputHTMLAttributes<HTMLInputElement>> &
  r.FieldOptions & { ref?: Ref<HTMLInputElement> };
export function Input({
  variant,
  invalid,
  layout,
  type = "text",
  ...props
}: InputProps) {
  const inherited = useContext(FieldVariant);
  variant ??= inherited;
  invalid =
    invalid ??
    (props["aria-invalid"] !== undefined &&
      props["aria-invalid"] !== false &&
      props["aria-invalid"] !== "false");
  return (
    <input
      {...props}
      type={type}
      {...p.controlPart("input", { variant, invalid, layout })}
    />
  );
}
export type SelectProps = Native<SelectHTMLAttributes<HTMLSelectElement>> &
  r.FieldOptions & { ref?: Ref<HTMLSelectElement> };
export function Select({ variant, invalid, layout, ...props }: SelectProps) {
  const inherited = useContext(FieldVariant);
  variant ??= inherited;
  invalid =
    invalid ??
    (props["aria-invalid"] !== undefined &&
      props["aria-invalid"] !== false &&
      props["aria-invalid"] !== "false");
  return (
    <select
      {...props}
      {...p.controlPart("select", { variant, invalid, layout })}
    />
  );
}
export type TextareaProps = Native<
  TextareaHTMLAttributes<HTMLTextAreaElement>
> &
  r.FieldOptions & { ref?: Ref<HTMLTextAreaElement> };
export function Textarea({
  variant,
  invalid,
  layout,
  ...props
}: TextareaProps) {
  const inherited = useContext(FieldVariant);
  variant ??= inherited;
  invalid =
    invalid ??
    (props["aria-invalid"] !== undefined &&
      props["aria-invalid"] !== false &&
      props["aria-invalid"] !== "false");
  return (
    <textarea
      {...props}
      {...p.controlPart("textarea", { variant, invalid, layout })}
    />
  );
}
export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
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
export function Field({
  label,
  hint,
  error,
  id,
  describedBy,
  children,
  variant,
  invalid,
  layout,
}: FieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  const slots = r.fieldRecipe({ variant, invalid: !!error || invalid });
  const description =
    [
      describedBy,
      hint ? controlId + "-hint" : undefined,
      error ? controlId + "-error" : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div data-ds="field" className={r.withLayout(slots.root, layout)}>
      <label htmlFor={controlId} className={slots.label}>
        {label}
      </label>
      <FieldVariant value={variant}>
        {children({
          id: controlId,
          "aria-describedby": description,
          "aria-invalid": !!error || invalid || undefined,
        })}
      </FieldVariant>
      {hint && (
        <p id={controlId + "-hint"} className={slots.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={controlId + "-error"} role="alert" className={slots.error}>
          {error}
        </p>
      )}
    </div>
  );
}
export type CheckboxProps = Native<
  Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">
> &
  r.CheckboxOptions & {
    label: ReactNode;
  };
export function Checkbox({ variant, label, layout, ...props }: CheckboxProps) {
  const slots = r.checkboxRecipe({ variant });
  return (
    <label className={r.withLayout(slots.root, layout)}>
      <input {...props} {...p.checkboxPart({ variant })} />
      <span>{label}</span>
    </label>
  );
}
export type SwitchProps = Native<
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange">
> &
  r.SwitchOptions & {
    label: string;
    mode?: "button" | "checkbox";
    name?: string;
    busy?: boolean;
    onChange?: (value: boolean) => void;
  };
export function Switch({
  variant,
  checked = false,
  label,
  layout,
  busy = false,
  onChange,
  onClick,
  mode = "button",
  name,
  ...props
}: SwitchProps) {
  const slots = r.switchRecipe({ variant, checked });
  if (mode === "checkbox")
    return (
      <label className={r.withLayout(slots.label, layout)}>
        <input
          {...(props as InputHTMLAttributes<HTMLInputElement>)}
          name={name}
          type="checkbox"
          role="switch"
          className={slots.input}
          aria-label={label}
          aria-busy={busy}
          aria-disabled={busy || undefined}
          checked={checked}
          disabled={props.disabled}
          onClick={(event) => {
            if (busy) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onChange={(event) => onChange?.(event.target.checked)}
        />
        <span aria-hidden="true" className={slots.root}>
          <span className={slots.thumb} />
        </span>
        <span>{label}</span>
      </label>
    );
  return (
    <button
      {...props}
      type="button"
      role="switch"
      data-ds="switch"
      aria-label={label}
      aria-checked={checked}
      aria-busy={busy}
      aria-disabled={busy || props["aria-disabled"] || undefined}
      className={r.withLayout(slots.root, layout)}
      onClick={(event) => {
        if (busy || props["aria-disabled"]) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
        if (!event.defaultPrevented) onChange?.(!checked);
      }}
    >
      <span aria-hidden="true" className={slots.thumb} />
    </button>
  );
}
export function Card({
  as: Tag = "article",
  variant,
  layout,
  ...props
}: Native<HTMLAttributes<HTMLElement>> &
  r.CardOptions & { as?: "article" | "section" | "div" | "aside" }) {
  return (
    <Tag
      {...props}
      className={r.withLayout(r.cardRecipe({ variant }), layout)}
    />
  );
}
export const Surface = Card;
export function Badge({
  intent,
  variant,
  layout,
  ...props
}: Native<HTMLAttributes<HTMLSpanElement>> & r.FeedbackOptions) {
  return (
    <span
      {...props}
      className={r.withLayout(r.badgeRecipe({ intent, variant }), layout)}
    />
  );
}
export function Toolbar({
  label,
  layout,
  ...props
}: Native<HTMLAttributes<HTMLDivElement>> & {
  label: string;
}) {
  return (
    <div
      {...props}
      role="toolbar"
      aria-label={label}
      className={r.withLayout(r.toolbarRecipe(), layout)}
    />
  );
}
export function Status({
  variant,
  intent,
  layout,
  ...props
}: Native<HTMLAttributes<HTMLParagraphElement>> & r.FeedbackOptions) {
  return (
    <p
      {...props}
      role={props.role ?? "status"}
      className={r.withLayout(r.statusRecipe({ intent, variant }), layout)}
    />
  );
}
export function Loading({
  layout,
  ...props
}: Native<HTMLAttributes<HTMLParagraphElement>>) {
  return (
    <p
      {...props}
      role="status"
      aria-busy="true"
      className={r.withLayout(r.loadingRecipe(), layout)}
    />
  );
}
export function EmptyState({
  variant,
  title,
  body,
  action,
  layout,
  ...props
}: Native<HTMLAttributes<HTMLElement>> &
  r.EmptyStateOptions & {
    title: string;
    body?: ReactNode;
    action?: ReactNode;
    layout?: r.LayoutClass;
  }) {
  const slots = r.emptyStateRecipe({ variant });
  return (
    <section {...props} className={r.withLayout(slots.root, layout)}>
      <h3 className={slots.title}>{title}</h3>
      {body && <p className={slots.body}>{body}</p>}
      {action && <div className={slots.actions}>{action}</div>}
    </section>
  );
}
export interface ToggleGroupProps
  extends
    r.ToggleGroupOptions,
    Omit<Native<HTMLAttributes<HTMLDivElement>>, "onChange"> {
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
export function ToggleGroup({
  variant,
  label,
  items,
  value,
  separator,
  onChange,
  layout,
  ...props
}: ToggleGroupProps) {
  return (
    <div
      {...props}
      role="group"
      aria-label={label}
      className={r.withLayout(r.toggleGroupRecipe({ variant, separator }).root, layout)}
    >
      {items.map((item, index) => (
        <Fragment key={item.value}>
        {index > 0 && separator !== undefined && <span aria-hidden="true">{separator}</span>}
        <button
          {...p.toggleItemPart(
            { variant, separator },
            value === item.value,
            item.disabled,
          )}
          onClick={(event) => {
            if (!p.activationBlocked(event.currentTarget))
              onChange?.(item.value);
          }}
        >
          {item.label}
        </button>
        </Fragment>
      ))}
    </div>
  );
}
export interface DialogProps
  extends
    r.DialogOptions,
    Omit<Native<HTMLAttributes<HTMLDialogElement>>, "title" | "onCancel"> {
  open: boolean;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
  behavior?: DialogBehaviorOptions;
  onClose?: () => void;
  onCancel?: DialogBehaviorOptions["onCancel"];
  /** Static, nonmodal specimen for the dev showcase only. */
  specimen?: boolean;
}
export function Dialog({
  variant,
  open,
  title,
  body,
  children,
  actions,
  behavior,
  onClose,
  onCancel,
  specimen = false,
  layout,
  ...props
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(),
    bodyId = useId();
  const latest = useRef({ behavior, onClose, onCancel });
  latest.current = { behavior, onClose, onCancel };
  const controller = useRef<ReturnType<typeof openDialog> | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!open || specimen || !ref.current) return;
    const active = openDialog(ref.current, {
      ...latest.current.behavior,
      onCancel: (reason) => {
        latest.current.behavior?.onCancel?.(reason);
        latest.current.onCancel?.(reason);
      },
      onClose: () => {
        latest.current.behavior?.onClose?.();
        latest.current.onClose?.();
      },
    });
    controller.current = active;
    return () => {
      active.dispose();
      controller.current = undefined;
    };
  }, [open, specimen]);
  useEffect(
    () => controller.current?.setBusy(!!behavior?.busy),
    [behavior?.busy],
  );
  const slots = r.dialogRecipe({ variant });
  const node = (
    <dialog
      {...props}
      ref={ref}
      open={specimen ? open : undefined}
      data-ds="dialog"
      role={
        props.role ??
        (variant === "confirm" || variant === "admin-confirm" || variant === "admin-reason"
          ? "alertdialog"
          : "dialog")
      }
      aria-labelledby={props["aria-labelledby"] ?? titleId}
      aria-describedby={
        props["aria-describedby"] ?? (body ? bodyId : undefined)
      }
      className={r.withLayout(slots.panel, layout)}
    >
      <div className={slots.content}>
        <header className={slots.header}>
          <h2 id={titleId} className={slots.title}>
            {title}
          </h2>
        </header>
        {body && (
          <p id={bodyId} className={slots.body}>
            {body}
          </p>
        )}
        {children}
        {actions && <div className={slots.actions}>{actions}</div>}
      </div>
    </dialog>
  );
  return specimen
    ? node
    : typeof document === "undefined"
      ? null
      : createPortal(node, document.body);
}
export const Sheet = (props: Omit<DialogProps, "variant">) => (
  <Dialog {...props} variant="sheet" />
);
export const Drawer = (props: Omit<DialogProps, "variant">) => (
  <Dialog {...props} variant="drawer" />
);
export const ConfirmDialog = ({variant="confirm",...props}: Omit<DialogProps, "variant"> & {variant?: "confirm"|"admin-confirm"|"admin-reason"}) => (
  <Dialog {...props} variant={variant} />
);
export interface MenuProps
  extends
    r.MenuOptions,
    Omit<Native<HTMLAttributes<HTMLDivElement>>, "onSelect"> {
  label: string;
  items: readonly {
    label: string;
    disabled?: boolean;
    busy?: boolean;
    checked?: boolean;
    danger?: boolean;
    onSelect: () => void;
  }[];
  onEscape?: () => void;
  /** Omit for a static list; supply to render an anchored, keyboard-operable popup. */
  trigger?: ReactNode;
  placement?: "start" | "end";
}
export function Menu({
  variant,
  label,
  items,
  onEscape,
  trigger,
  placement = "start",
  layout,
  ...props
}: MenuProps) {
  const ref = useRef<HTMLDivElement>(null),
    triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const latest = useRef(onEscape);
  latest.current = onEscape;
  const id = useId();
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
    latest.current?.();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(
    () =>
      ref.current ? bindMenu(ref.current, () => closeRef.current()) : undefined,
    [],
  );
  useEffect(() => {
    if (!open || !trigger) return;
    ref.current
      ?.querySelector<HTMLElement>(
        '[role^="menuitem"]:not(:disabled):not([aria-disabled="true"])',
      )
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (
        !ref.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      )
        closeRef.current();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, trigger]);
  const slots = r.menuRecipe({ variant });
  const list = (
    <div
      {...props}
      id={props.id ?? id}
      ref={ref}
      hidden={trigger ? !open : props.hidden}
      role="menu"
      aria-label={label}
      className={r.withLayout(slots.root, layout)}
    >
      {items.map((item, index) => (
        <button
          key={item.label + index}
          {...p.menuItemPart({ variant }, item)}
          onClick={(event) => {
            if (p.activationBlocked(event.currentTarget)) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            item.onSelect();
            if (trigger) close();
          }}
        >
          {item.label}
          {item.checked && (
            <span aria-hidden="true" className={slots.check}>
              ✓
            </span>
          )}
        </button>
      ))}
    </div>
  );
  return trigger ? (
    <div className="ds-menu-anchor" data-placement={placement}>
      <Button
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={props.id ?? id}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </Button>
      {list}
    </div>
  ) : (
    list
  );
}
export function Toast({
  kind,
  font,
  children,
}: r.ToastOptions & { children: ReactNode }) {
  return (
    <div {...p.toastPart(kind)} className={r.toastRecipe({ kind, font })}>
      {children}
    </div>
  );
}
const TableVariant = createContext<r.TableOptions["variant"]>(undefined);
export function Table({
  variant,
  layout,
  ...props
}: Native<HTMLAttributes<HTMLTableElement>> & r.TableOptions) {
  const inherited = useContext(TableVariant);
  variant ??= inherited;
  return (
    <TableVariant value={variant}>
      <table
        {...props}
        className={r.withLayout(r.tableRecipe({ variant }).root, layout)}
      />
    </TableVariant>
  );
}
export function TableHeader({
  variant,
  layout,
  ...props
}: Native<ThHTMLAttributes<HTMLTableCellElement>> & r.TableOptions) {
  const inherited = useContext(TableVariant);
  return (
    <th
      {...props}
      className={r.withLayout(
        r.tableRecipe({ variant: variant ?? inherited }).header,
        layout,
      )}
    />
  );
}
export function TableCell({
  variant,
  mono,
  layout,
  ...props
}: Native<TdHTMLAttributes<HTMLTableCellElement>> & r.TableOptions) {
  const inherited = useContext(TableVariant);
  return (
    <td
      {...props}
      className={r.withLayout(
        r.tableRecipe({ variant: variant ?? inherited, mono }).cell,
        layout,
      )}
    />
  );
}
export function TableRow({
  variant,
  layout,
  ...props
}: Native<HTMLAttributes<HTMLTableRowElement>> & r.TableOptions) {
  const inherited = useContext(TableVariant);
  return (
    <tr
      {...props}
      className={r.withLayout(
        r.tableRecipe({ variant: variant ?? inherited }).row,
        layout,
      )}
    />
  );
}
export function TableEmpty({
  variant,
  mono,
  layout,
  ...props
}: Native<TdHTMLAttributes<HTMLTableCellElement>> & r.TableOptions) {
  const inherited = useContext(TableVariant);
  return (
    <td
      {...props}
      className={r.withLayout(
        r.tableRecipe({ variant: variant ?? inherited }).empty,
        layout,
      )}
    />
  );
}
export function TablePagination({
  variant,
  layout,
  ...props
}: Native<HTMLAttributes<HTMLDivElement>> & r.TableOptions) {
  const inherited = useContext(TableVariant);
  return (
    <div
      {...props}
      className={r.withLayout(
        r.tableRecipe({ variant: variant ?? inherited }).pagination,
        layout,
      )}
    />
  );
}
export function TableWrap({
  bounded,
  variant,
  layout,
  ...props
}: Native<HTMLAttributes<HTMLDivElement>> & r.TableOptions) {
  return (
    <TableVariant value={variant}>
      <div
        {...props}
        className={r.withLayout(r.tableRecipe({ variant, bounded }).wrap, layout)}
      />
    </TableVariant>
  );
}

/** Finite semantic composition slots, shared with DOM workspaces. */
export function Workspace({as: Tag = 'div', part, layout, ...props}: Native<HTMLAttributes<HTMLElement>> & {as?: 'main'|'header'|'div'|'section'|'span'|'p'|'h1'|'h2'|'h3'|'dl'|'dt'|'dd'|'pre'|'strong'|'small'|'fieldset'|'legend'; part:r.WorkspacePart;ref?:Ref<any>}) {
  return <Tag {...props} className={r.withLayout(r.workspaceRecipe(part),layout)}/>;
}
export function NavigationTabs({label, items, value, onNavigate, variant, layout, ...props}: Native<HTMLAttributes<HTMLElement>> & r.NavigationOptions & {label:string;items:readonly {value:string;label:string;href:string}[];value:string;onNavigate?:(value:string)=>void}) {
  const slots=r.navigationRecipe({variant});
  return <nav {...props} aria-label={label} className={r.withLayout(slots.root,layout)}>{items.map(item=><a key={item.value} href={item.href} aria-current={value===item.value?'page':undefined} className={slots.item(value===item.value)} onClick={event=>{if(onNavigate&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.button===0){event.preventDefault();onNavigate(item.value);}}}>{item.label}</a>)}</nav>;
}
