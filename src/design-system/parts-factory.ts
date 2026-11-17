import {toastPart, activationBlocked} from "./parts-common";
/** Framework-neutral part contracts: both adapters spread/apply these exact attributes. */
import type * as r from "./recipes";



export function createParts(recipes: Pick<typeof r, 'buttonRecipe'|'iconButtonRecipe'|'checkboxRecipe'|'toggleGroupRecipe'|'menuRecipe'|'inputRecipe'|'selectRecipe'|'textareaRecipe'|'withLayout'>) {

function buttonPart(
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
    className: recipes.withLayout(
      options.icon ? recipes.iconButtonRecipe(options.icon) : recipes.buttonRecipe(options),
      options.layout,
    ),
    "aria-busy": !!options.busy,
    "aria-disabled": options.busy || undefined,
    "aria-pressed": options.pressed,
    disabled: !!options.disabled,
  };
}
function checkboxPart(options: r.CheckboxOptions = {}) {
  return {
    type: "checkbox" as const,
    "data-ds": "checkbox",
    className: recipes.checkboxRecipe(options).control,
  };
}
function toggleItemPart(
  options: r.ToggleGroupOptions,
  pressed: boolean,
  disabled?: boolean,
) {
  return {
    ...buttonPart({ pressed, disabled }),
    className: recipes.toggleGroupRecipe(options).item(pressed),
  };
}
function menuItemPart(
  options: r.MenuOptions,
  item: {
    disabled?: boolean;
    busy?: boolean;
    checked?: boolean;
    danger?: boolean;
  },
) {
  const slots = recipes.menuRecipe(options);
  return {
    ...buttonPart(item),
    "data-ds": "menu-item",
    tabIndex: -1,
    role: item.checked === undefined ? "menuitem" : "menuitemcheckbox",
    "aria-checked": item.checked,
    className: slots.item + (item.danger ? " " + slots.danger : ""),
  };
}
function controlPart(
  kind: "input" | "select" | "textarea",
  options: r.FieldOptions & { layout?: r.LayoutClass } = {},
) {
  const recipe =
    kind === "select"
      ? recipes.selectRecipe
      : kind === "textarea"
        ? recipes.textareaRecipe
        : recipes.inputRecipe;
  return {
    "data-ds": kind,
    "data-field-variant": options.variant ?? "boxed",
    "aria-invalid": options.invalid || undefined,
    className: recipes.withLayout(recipe(options), options.layout),
  };
}
return { buttonPart, checkboxPart, toggleItemPart, menuItemPart, controlPart, toastPart, activationBlocked };
}
