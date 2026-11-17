/** Framework-neutral part contracts: both adapters spread/apply these exact attributes. */
import * as r from "./recipes";
export function buttonPart(
  options: r.ButtonOptions & {
    busy?: boolean;
    disabled?: boolean;
    layout?: r.LayoutClass;
    icon?: r.IconButtonOptions;
  } = {},
) {
  return {
    type: "button" as const,
    "data-ds": options.icon ? "icon-button" : "button",
    className: r.withLayout(
      options.icon ? r.iconButtonRecipe(options.icon) : r.buttonRecipe(options),
      options.layout,
    ),
    "aria-busy": !!options.busy,
    "aria-disabled": options.busy || undefined,
    "aria-pressed": options.pressed,
    disabled: !!options.disabled,
  };
}
export function checkboxPart(options: r.CheckboxOptions = {}) {
  return {
    type: "checkbox" as const,
    "data-ds": "checkbox",
    className: r.checkboxRecipe(options).control,
  };
}
export function toggleItemPart(
  options: r.ToggleGroupOptions,
  pressed: boolean,
  disabled?: boolean,
) {
  return {
    ...buttonPart({ pressed, disabled }),
    className: r.toggleGroupRecipe(options).item(pressed),
  };
}
export function menuItemPart(
  options: r.MenuOptions,
  item: {
    disabled?: boolean;
    busy?: boolean;
    checked?: boolean;
    danger?: boolean;
  },
) {
  const slots = r.menuRecipe(options);
  return {
    ...buttonPart(item),
    "data-ds": "menu-item",
    tabIndex: -1,
    role: item.checked === undefined ? "menuitem" : "menuitemcheckbox",
    "aria-checked": item.checked,
    className: slots.item + (item.danger ? " " + slots.danger : ""),
  };
}
export function controlPart(
  kind: "input" | "select" | "textarea",
  options: r.FieldOptions & { layout?: r.LayoutClass } = {},
) {
  const recipe =
    kind === "select"
      ? r.selectRecipe
      : kind === "textarea"
        ? r.textareaRecipe
        : r.inputRecipe;
  return {
    "data-ds": kind,
    "data-field-variant": options.variant ?? "boxed",
    "aria-invalid": options.invalid || undefined,
    className: r.withLayout(recipe(options), options.layout),
  };
}
export function toastPart(kind: r.ToastOptions["kind"] = "info") {
  return {
    "data-ds": "toast",
    role: kind === "error" ? "alert" : "status",
    "aria-live": kind === "error" ? "assertive" : "polite",
    "aria-atomic": true,
  } as const;
}
export function activationBlocked(control: {
  disabled?: boolean;
  getAttribute(name: string): string | null;
}) {
  return control.disabled || control.getAttribute("aria-disabled") === "true";
}
