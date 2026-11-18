import * as r from "../recipes";
import * as p from "../parts";
import {
  openDialog,
  menuPresentation,
  bindMenu,
  toast,
  type DialogBehaviorOptions,
  type DialogController,
} from "../behavior";
export { toast, closeOverlay } from "../behavior";
export type Attributes = Record<string, string | number | boolean | undefined>;
export interface ElementOptions {
  attrs?: Attributes;
  layout?: r.LayoutClass;
}
function attributes(el: HTMLElement, attrs: Attributes = {}) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (key === "class" || key === "style" || key.startsWith("on"))
      throw Error("Use named recipe options and event listeners");
    el.setAttribute(key, String(value));
  }
}
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classes: string,
  text?: string,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = r.withLayout(classes, options.layout);
  if (text !== undefined) el.textContent = text;
  attributes(el, options.attrs);
  return el;
}
function applyPart(
  el: HTMLElement,
  part: Record<string, string | number | boolean | undefined>,
) {
  for (const [key, value] of Object.entries(part)) {
    if (key === "className") el.className = value as string;
    else if (key === "disabled") (el as HTMLButtonElement).disabled = !!value;
    else if (value === undefined) el.removeAttribute(key);
    else el.setAttribute(key, String(value));
  }
}
const buttonState = new WeakMap<
  HTMLButtonElement,
  { options: Partial<ButtonOptions>; icon?: r.IconButtonOptions }
>();
const controlState = new WeakMap<HTMLElement, ControlOptions>();
export interface ButtonOptions extends r.ButtonOptions, ElementOptions {
  text: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  busy?: boolean;
  onClick?: (event: MouseEvent) => void;
}
/** State can be updated in place without replacing classes/hooks or losing keyboard focus. */
export function updateButton(
  button: HTMLButtonElement,
  options: Omit<ButtonOptions, "text"> & {
    text?: string;
  },
) {
  const prior = buttonState.get(button);
  const merged = { ...prior?.options, ...options };
  buttonState.set(button, { options: merged, icon: prior?.icon });
  applyPart(button, p.buttonPart({ ...merged, icon: prior?.icon }));
  button.type = merged.type ?? "button";
  if (options.text !== undefined) button.textContent = options.text;
  attributes(button, merged.attrs);
  if (merged.busy) button.setAttribute("aria-disabled", "true");
}

export function createButton(options: ButtonOptions): HTMLButtonElement {
  const button = element("button", "", options.text);
  button.dataset.ds = "button";
  updateButton(button, options);
  button.addEventListener("click", (event) => {
    if (button.getAttribute("aria-disabled") === "true" || button.disabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    options.onClick?.(event);
  });
  return button;
}
export interface IconButtonOptions extends r.IconButtonOptions, ElementOptions {
  label: string;
  icon?: Node;
  disabled?: boolean;
  busy?: boolean;
  pressed?: boolean;
  onClick?: (event: MouseEvent) => void;
}
export function createIconButton(options: IconButtonOptions) {
  const button = createButton({
    text: "",
    disabled: options.disabled,
    busy: options.busy,
    pressed: options.pressed,
    onClick: options.onClick,
    attrs: { ...options.attrs, "aria-label": options.label },
  });
  buttonState.set(button, {
    options: { ...options, variant: undefined },
    icon: { variant: options.variant, size: options.size },
  });
  button.className = r.withLayout(r.iconButtonRecipe(options), options.layout);
  button.dataset.ds = "icon-button";
  if (options.icon) {
    const icon = options.icon;
    if (icon instanceof Element) icon.setAttribute("aria-hidden", "true");
    button.append(icon);
  }
  return button;
}
export interface ControlOptions extends r.FieldOptions, ElementOptions {
  id?: string;
  value?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  onInput?: (event: Event) => void;
}
function control<
  T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
>(el: T, options: ControlOptions): T {
  controlState.set(el, options);
  applyPart(
    el,
    p.controlPart(
      el.tagName.toLowerCase() as "input" | "select" | "textarea",
      options,
    ),
  );
  if (options.id) el.id = options.id;
  if (options.name) el.name = options.name;
  if (options.value !== undefined) el.value = options.value;
  el.disabled = !!options.disabled;
  el.required = !!options.required;
  if (options.invalid) el.setAttribute("aria-invalid", "true");
  if (options.onInput) el.addEventListener("input", options.onInput);
  return el;
}
export function createInput(
  options: ControlOptions & {
    type?: string;
  } = {},
) {
  const el = element("input", r.inputRecipe(options), undefined, options);
  el.type = options.type ?? "text";
  el.dataset.ds = "input";
  return control(el, options);
}
export function createSelect(
  options: ControlOptions & {
    options?: readonly {
      value: string;
      label: string;
      disabled?: boolean;
    }[];
  } = {},
) {
  const el = element("select", r.selectRecipe(options), undefined, options);
  for (const item of options.options ?? []) {
    const option = element("option", "", item.label);
    option.value = item.value;
    option.disabled = !!item.disabled;
    el.append(option);
  }
  el.dataset.ds = "select";
  return control(el, options);
}
export function createTextarea(options: ControlOptions = {}) {
  const el = element("textarea", r.textareaRecipe(options), undefined, options);
  el.dataset.ds = "textarea";
  return control(el, options);
}
let fieldId = 0;
export interface FieldOptions extends r.FieldOptions, ElementOptions {
  label: string;
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  hint?: string;
  error?: string;
  id?: string;
}
const fieldState = new WeakMap<
  HTMLElement,
  { options: FieldOptions; described: string | null }
>();
export function createField(options: FieldOptions) {
  const root = element("div", "", undefined, options);
  root.dataset.ds = "field";
  fieldState.set(root, {
    options,
    described: options.control.getAttribute("aria-describedby"),
  });
  updateField(root, {});
  return root;
}
/** Clear an error with {error: undefined}; retain control identity, native state and hooks. */
export function updateField(
  root: HTMLElement,
  patch: Partial<Omit<FieldOptions, "control">>,
) {
  const state = fieldState.get(root);
  if (!state) throw Error("updateField requires a createField root");
  const options = (state.options = { ...state.options, ...patch });
  const control = options.control;
  const prior = controlState.get(control) ?? {};
  const appearance = {
    ...prior,
    variant: options.variant ?? prior.variant,
    density: options.density ?? prior.density,
    invalid: !!options.error || !!options.invalid,
  };
  const slots = r.fieldRecipe(appearance);
  root.className = r.withLayout(slots.root, options.layout);
  attributes(root, options.attrs);
  control.id = options.id ?? (control.id || `ds-field-${++fieldId}`);
  applyPart(
    control,
    p.controlPart(
      control.tagName.toLowerCase() as "input" | "select" | "textarea",
      appearance,
    ),
  );
  const label = element("label", slots.label, options.label);
  label.htmlFor = control.id;
  // Do not detach the focused native control when just updating validation.
  for (const child of [...root.children]) if (child !== control) child.remove();
  root.prepend(label);
  if (control.parentElement !== root) root.append(control);
  const described = [state.described];
  for (const key of ["hint", "error"] as const)
    if (options[key]) {
      const part = element("p", slots[key], options[key]);
      part.id = control.id + "-" + key;
      if (key === "error") part.setAttribute("role", "alert");
      root.append(part);
      described.push(part.id);
    }
  const ids = described.filter(Boolean).join(" ");
  if (ids) control.setAttribute("aria-describedby", ids);
  else control.removeAttribute("aria-describedby");
}
/** A caption for a composite field, without pretending the group is one native input. */
export function createFieldGroup(
  options: r.FieldOptions &
    ElementOptions & {
      label: string;
      labelId?: string;
      content: HTMLElement;
    },
) {
  const slots = r.fieldRecipe(options);
  const root = element("div", slots.root, undefined, options);
  const caption = element("span", slots.label, options.label);
  caption.id = options.labelId ?? `ds-field-group-${++fieldId}`;
  options.content.setAttribute("role", "group");
  options.content.setAttribute("aria-labelledby", caption.id);
  root.append(caption, options.content);
  return root;
}
export interface CheckboxOptions extends r.CheckboxOptions, ElementOptions {
  label: string;
  checked?: boolean;
  disabled?: boolean;
  name?: string;
  value?: string;
  readOnly?: boolean;
  onChange?: (checked: boolean) => void;
}
export function createCheckbox(options: CheckboxOptions) {
  const slots = r.checkboxRecipe(options);
  const root = element("label", slots.root, undefined, {
    layout: options.layout,
  });
  const input = element("input", "", undefined, { attrs: options.attrs });
  applyPart(input, p.checkboxPart(options));
  input.readOnly = !!options.readOnly;
  input.checked = !!options.checked;
  input.disabled = !!options.disabled;
  if (options.name) input.name = options.name;
  if (options.value) input.value = options.value;
  input.addEventListener("change", () => options.onChange?.(input.checked));
  root.append(input, element("span", "", options.label));
  return root;
}
export interface SwitchOptions extends r.SwitchOptions, ElementOptions {
  mode?: "button" | "checkbox";
  name?: string;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onChange?: (checked: boolean) => void;
}
export function createSwitch(options: SwitchOptions): HTMLElement {
  const slots = r.switchRecipe(options);
  if (options.mode === "checkbox") {
    const root = element("label", slots.label, undefined, {
        layout: options.layout,
      }),
      input = element("input", slots.input, undefined, {
        attrs: options.attrs,
      }),
      track = element("span", slots.root),
      thumb = element("span", slots.thumb);
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.setAttribute("aria-checked", String(!!options.checked));
    input.checked = !!options.checked;
    input.disabled = !!options.disabled;
    if (options.name) input.name = options.name;
    input.setAttribute("aria-label", options.label);
    input.setAttribute("aria-busy", String(!!options.busy));
    if (options.busy) input.setAttribute("aria-disabled", "true");
    input.addEventListener("click", (event) => {
      if (input.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    });
    input.addEventListener("change", () => options.onChange?.(input.checked));
    track.setAttribute("aria-hidden", "true");
    track.append(thumb);
    root.append(input, track, element("span", "", options.label));
    return root;
  }
  const button = createButton({
    text: "",
    disabled: options.disabled,
    busy: options.busy,
    attrs: {
      ...options.attrs,
      role: "switch",
      "aria-checked": String(!!options.checked),
      "aria-label": options.label,
    },
    onClick: () =>
      options.onChange?.(button.getAttribute("aria-checked") !== "true"),
  });
  button.className = r.withLayout(slots.root, options.layout);
  button.dataset.ds = "switch";
  const thumb = element("span", slots.thumb);
  thumb.setAttribute("aria-hidden", "true");
  button.append(thumb);
  return button;
}
export function createCard(
  options: r.CardOptions &
    ElementOptions & {
      as?: "article" | "section" | "div" | "aside" | "li";
      text?: string;
    } = {},
) {
  return element(
    options.as ?? "article",
    r.cardRecipe(options),
    options.text,
    options,
  );
}
export const createSurface = createCard;
export function createBadge(
  options: r.BadgeOptions &
    ElementOptions & {
      text: string;
    },
) {
  return element("span", r.badgeRecipe(options), options.text, options);
}
export function createToolbar(
  options: ElementOptions & {
    label: string;
  },
) {
  return element("div", r.toolbarRecipe(), undefined, {
    ...options,
    attrs: { ...options.attrs, role: "toolbar", "aria-label": options.label },
  });
}
export function createStatus(
  options: r.FeedbackOptions &
    ElementOptions & {
      text: string;
    },
) {
  return element("p", r.statusRecipe(options), options.text, {
    ...options,
    attrs: { ...options.attrs, role: options.attrs?.role ?? "status" },
  });
}
export function createLoading(
  options: ElementOptions & {
    text: string;
  },
) {
  return element("p", r.loadingRecipe(), options.text, {
    ...options,
    attrs: { ...options.attrs, role: "status", "aria-busy": "true" },
  });
}
export function createEmptyState(
  options: r.EmptyStateOptions &
    ElementOptions & {
      title: string;
      body?: string;
      action?: Node;
    },
) {
  const slots = r.emptyStateRecipe(options);
  const root = element("section", slots.root, undefined, options);
  root.append(element("h3", slots.title, options.title));
  if (options.body) root.append(element("p", slots.body, options.body));
  if (options.action) {
    const actions = element("div", slots.actions);
    actions.append(options.action);
    root.append(actions);
  }
  return root;
}
export function createControlGroup(
  options: ElementOptions & { content?: Node | readonly Node[] } = {},
) {
  const group = element("span", r.controlGroupRecipe(), undefined, options);
  group.dataset.ds = "control-group";
  if (options.content)
    group.append(
      ...((Array.isArray(options.content)
        ? options.content
        : [options.content]) as Node[]),
    );
  return group;
}
export interface ToggleGroupOptions
  extends r.ToggleGroupOptions, ElementOptions {
  label: string;
  items: readonly {
    label: string;
    value: string;
    disabled?: boolean;
  }[];
  value: string;
  onChange?: (value: string) => void;
}
export function createToggleGroup(options: ToggleGroupOptions) {
  const root = element("div", r.toggleGroupRecipe(options).root, undefined, {
    ...options,
    attrs: { ...options.attrs, role: "group", "aria-label": options.label },
  });
  for (const [index, item] of options.items.entries()) {
    if (index > 0 && options.separator !== undefined) {
      const separator = document.createElement("span");
      separator.setAttribute("aria-hidden", "true");
      separator.textContent = options.separator;
      root.append(separator);
    }
    const button = createButton({
      text: item.label,
      disabled: item.disabled,
      pressed: options.value === item.value,
      onClick: () => options.onChange?.(item.value),
    });
    applyPart(
      button,
      p.toggleItemPart(options, options.value === item.value, item.disabled),
    );
    root.append(button);
  }
  return root;
}
export interface DialogOptions extends r.DialogOptions, ElementOptions {
  title: string;
  body?: string;
  content?: Node;
  actions?: Node;
  behavior?: DialogBehaviorOptions;
}
export function createDialog(options: DialogOptions) {
  const slots = r.dialogRecipe(options),
    dialog = element("dialog", slots.panel, undefined, options);
  dialog.dataset.ds = "dialog";
  dialog.dataset.dialogLayout = options.presentation === "anchored" ? "anchored" : options.variant === "transcription-review" ? "fullscreen" : "centered";
  const titleId = `ds-dialog-${++fieldId}-title`,
    bodyId = titleId + "-body";
  if (options.title && !dialog.hasAttribute("aria-label") && !dialog.hasAttribute("aria-labelledby"))
    dialog.setAttribute("aria-labelledby", titleId);
  dialog.setAttribute(
    "role",
    (options.attrs?.role as string) ??
      (options.variant === "confirm"
        ? "alertdialog"
        : "dialog"),
  );
  if (options.body && !dialog.hasAttribute("aria-describedby"))
    dialog.setAttribute("aria-describedby", bodyId);
  const content = element("div", slots.content);
  if (options.title) {
    const head = element("header", slots.header);
    const heading = element("h2", slots.title, options.title);
    heading.id = titleId;
    head.append(heading);
    content.append(head);
  }
  if (options.body) {
    const body = element("p", slots.body, options.body);
    body.id = bodyId;
    content.append(body);
  }
  if (options.content) content.append(options.content);
  if (options.actions) {
    const actions = element("div", slots.actions);
    actions.append(options.actions);
    content.append(actions);
  }
  dialog.append(content);
  let controller: DialogController | undefined;
  return {
    element: dialog,
    open: () =>
      (controller = openDialog(dialog, {
        ...options.behavior,
        motion: "panel",
        onClose: () => {
          options.behavior?.onClose?.();
          dialog.remove();
        },
      })),
    close: () => controller?.close(),
    requestClose: () => controller?.requestClose("button"),
    setBusy: (value: boolean) => controller?.setBusy(value),
  };
}
/** Small main menus share D48 policy; forms and sheets retain D12 centering. */
export function createMenuOverlay(options: DialogOptions & { anchor: HTMLElement }) {
  const { anchor, ...dialog } = options;
  const config: DialogOptions = { ...dialog, behavior: { ...dialog.behavior, opener: anchor } };
  const overlay = createDialog(config);
  return { ...overlay, open: () => {
    const presentation = menuPresentation();
    overlay.element.className = r.withLayout(r.dialogRecipe({ ...config, presentation }).panel, config.layout);
    overlay.element.dataset.dialogLayout = presentation;
    config.behavior!.anchor = presentation === "anchored" ? anchor : undefined;
    return overlay.open();
  } };
}
export const createSheet = ({
  variant = "sheet",
  ...options
}: Omit<DialogOptions, "variant"> & {
  variant?: "sheet" | "domain-sheet" | "library-sheet";
}) => createDialog({ ...options, variant });
export interface ConfirmDialogOptions extends Omit<DialogOptions, "variant"> {
  variant?: "confirm";
  /** Prefer this generated action for irreversible confirmations; custom actions must set intent themselves. */
  confirmAction?: { label: string; onConfirm: () => void };
}
export const createConfirmDialog = ({ confirmAction, ...options }: ConfirmDialogOptions) => {
  const actions = document.createDocumentFragment();
  if (options.actions) actions.append(options.actions);
  if (confirmAction) actions.append(createButton({
    text: confirmAction.label,
    intent: options.destructive ? "danger" : "primary",
    onClick: confirmAction.onConfirm,
  }));
  return createDialog({ ...options, actions, attrs: { ...options.attrs, role: "alertdialog" }, variant: options.variant ?? "confirm" });
};
export interface MenuItem {
  label: string;
  icon?: Node;
  disclosureIcon?: Node;
  options?: readonly MenuItem[];
  value?: string;
  radio?: boolean;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  busy?: boolean;
  onSelect: () => void;
}
export interface MenuOptions extends r.MenuOptions, ElementOptions {
  label: string;
  items: readonly MenuItem[];
  onEscape?: () => void;
}
export function createMenu(options: MenuOptions) {
  const slots = r.menuRecipe(options),
    root = element("div", slots.root, undefined, {
      ...options,
      attrs: { ...options.attrs, role: "menu", "aria-label": options.label },
    });
  if (!root.id) root.id = `ds-menu-${++fieldId}`;
  const appendItems = (
    parent: HTMLElement,
    items: readonly MenuItem[],
    nested = false,
  ) => {
    for (const item of items) {
      const button = createButton({
        text: "",
        disabled: item.disabled,
        busy: item.busy,
        onClick: item.options ? undefined : item.onSelect,
        attrs: {
          role: item.checked === undefined ? "menuitem" : "menuitemcheckbox",
          ...(item.checked === undefined
            ? {}
            : { "aria-checked": String(item.checked) }),
        },
      });
      applyPart(button, p.menuItemPart(options, item));
      if (item.radio && item.checked !== undefined)
        button.setAttribute("role", "menuitemradio");
      if (item.icon) button.append(item.icon);
      button.append(document.createTextNode(item.label));
      if (nested && options.variant === "library")
        button.classList.add(...r.libraryMenuRecipe().option.split(" "));
      if (item.checked) {
        const check = element("span", slots.check, "✓");
        check.setAttribute("aria-hidden", "true");
        button.append(check);
      }
      parent.append(button);
      if (item.options) {
        const value = element(
          "span",
          r.libraryMenuRecipe().value,
          item.value ?? "",
        );
        button.append(value);
        const chevron = item.disclosureIcon ?? element("span", "", "⌄");
        if (chevron instanceof Element) {
          chevron.classList.add(...r.libraryMenuRecipe().chevron.split(" "));
          chevron.setAttribute("aria-hidden", "true");
        }
        button.append(chevron);
        const sub = element("div", r.libraryMenuRecipe().sub);
        sub.hidden = true;
        sub.setAttribute("role", "group");
        sub.setAttribute("aria-label", item.label);
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-haspopup", "true");
        appendItems(sub, item.options, true);
        parent.append(sub);
        button.addEventListener("click", () => {
          sub.hidden = !sub.hidden;
          button.setAttribute("aria-expanded", String(!sub.hidden));
          if (!sub.hidden)
            sub
              .querySelector<HTMLElement>('[aria-checked="true"]')
              ?.focus({ preventScroll: true });
        });
      }
    }
  };
  appendItems(root, options.items);
  const dispose = bindMenu(root, options.onEscape);
  return { element: root, dispose };
}
export function createToast(
  options: r.ToastOptions & {
    text: string;
  },
) {
  return element("div", r.toastRecipe(options), options.text, {
    attrs: p.toastPart(options.kind),
  });
}
export function createTable(options: r.TableOptions & ElementOptions = {}) {
  return element("table", r.tableRecipe(options).root, undefined, options);
}
export function createTableHeader(
  text: string,
  options: r.TableOptions & ElementOptions = {},
) {
  return element("th", r.tableRecipe(options).header, text, options);
}
export function createTableCell(
  text: string,
  options: r.TableOptions & ElementOptions = {},
) {
  return element("td", r.tableRecipe(options).cell, text, options);
}
export function createTableRow(options: r.TableOptions & ElementOptions = {}) {
  return element("tr", r.tableRecipe(options).row, undefined, options);
}
export function createTableEmpty(
  text: string,
  options: r.TableOptions & ElementOptions = {},
) {
  return element("td", r.tableRecipe(options).empty, text, options);
}
export function createTablePagination(
  options: r.TableOptions & ElementOptions = {},
) {
  return element("div", r.tableRecipe(options).pagination, undefined, options);
}
export function createTableWrap(options: r.TableOptions & ElementOptions = {}) {
  return element("div", r.tableRecipe(options).wrap, undefined, options);
}
/** Apply controlled state without rebuilding the control or replacing delegation hooks. */
export function updateSwitch(root: HTMLElement, options: SwitchOptions) {
  const slots = r.switchRecipe(options),
    input = root.querySelector<HTMLInputElement>('input[role="switch"]');
  const track = input ? (input.nextElementSibling as HTMLElement) : root;
  root.className = r.withLayout(
    input ? slots.label : slots.root,
    options.layout,
  );
  track.className = slots.root;
  if (track.firstElementChild) track.firstElementChild.className = slots.thumb;
  const control = input ?? root;
  if (input) {
    input.setAttribute("aria-checked", String(!!options.checked));
    input.checked = !!options.checked;
    input.disabled = !!options.disabled;
  } else {
    (root as HTMLButtonElement).disabled = !!options.disabled;
    root.setAttribute("aria-checked", String(!!options.checked));
  }
  control.setAttribute("aria-busy", String(!!options.busy));
  if (options.busy) control.setAttribute("aria-disabled", "true");
  else control.removeAttribute("aria-disabled");
}

/** Bind every table part to one parent-owned appearance, including detached construction. */
export function createTableParts(
  options: r.TableOptions & ElementOptions = {},
) {
  const variant = options.variant;
  return {
    table: createTable(options),
    header: (text: string, attrs?: Attributes) =>
      createTableHeader(text, { variant, attrs }),
    cell: (text: string, attrs?: Attributes) =>
      createTableCell(text, { variant, attrs }),
    row: (attrs?: Attributes) => createTableRow({ variant, attrs }),
    empty: (text: string, attrs?: Attributes) =>
      createTableEmpty(text, { variant, attrs }),
    pagination: () => createTablePagination({ variant }),
    wrap: () => createTableWrap({ variant }),
  };
}

/** Library composition slots share the same token/recipe boundary as controls. */
export function createLibraryPart<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  part: r.LibraryPart,
  options: ElementOptions & { text?: string } = {},
) {
  return element(tag, r.libraryPartRecipe(part), options.text, options);
}
export function updateLibraryBanner(banner: HTMLElement, muted: boolean) {
  banner.className = r.libraryPartRecipe("banner") + (muted ? " muted" : "");
}

/** Shared account composition, including the native Administration navigation link. */
export function createAccountPart<K extends keyof HTMLElementTagNameMap>(
  tag: K, part: r.AccountPart, options: ElementOptions & {text?: string} = {},
) {
  return element(tag, r.accountPartRecipe(part), options.text, options);
}

export { createTransport, createPlayerPart, createVoiceRow, createVoiceChip, createMixerVolume, createPlayerGlyph } from "./player";

export * from "./panels";

export * from "./main-screen";
