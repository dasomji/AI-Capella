import { normalizeRecipe } from "./normalize";

/** Pure, literal Tailwind recipes. Each property owns disjoint CSS properties. */
const controlBehavior = "tw:box-border tw:disabled:cursor-default tw:aria-disabled:cursor-wait tw:motion-reduce:transition-none";
const controlFocus = {
  standard: "tw:focus-visible:outline-solid tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:outline-focus tw:focus-visible:outline-offset-(--ds-space-compact)",
  admin: "tw:focus-visible:outline-solid tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:outline-admin-accent tw:focus-visible:outline-offset-(--ds-space-tight)",
  library: "tw:focus-visible:outline-solid tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:outline-ink tw:focus-visible:outline-offset-(--ds-space-compact)",
};
const unfocusedControlBase = controlBehavior + " tw:m-flush";
const adminControlBase = unfocusedControlBase + " " + controlFocus.admin;
export const controlBase = unfocusedControlBase + " " + controlFocus.standard;
export const disabledRecipe =
  "tw:disabled:opacity-(--ds-opacity-disabled) tw:aria-disabled:opacity-(--ds-opacity-disabled)";
const actionDisabled = "tw:disabled:opacity-(--ds-opacity-disabled-action) tw:aria-disabled:opacity-(--ds-opacity-disabled-action) tw:disabled:pointer-events-none tw:aria-disabled:pointer-events-none";
const denseDisabled =
  "tw:disabled:opacity-(--ds-opacity-disabled-admin) tw:aria-disabled:opacity-(--ds-opacity-disabled-admin)";
export const buttonVariants = [
  "scan-mark-go", "scan-mark-ok",
  "panel-step", "panel-tempo", "panel-round", "panel-preset", "section-mark", "section-word",
  "player-back",
  "player-mode",
  "player-info",
  "player-position",
  "player-transport",
  "player-stop-left",
  "player-stop-mid",
  "player-play",
  "player-toggle",
  "player-preference",
  "player-save",
  "player-voice-name",
  "player-voice-name-long",
  "player-mute",
  "player-solo",
  "player-chip",
  "player-mixer-chip",
  "player-segmented",
  "player-reset",

  "ensemble-switch", "ensemble-other", "device-link",
  "landing-create", "library-action", "landing-link", "landing-aside", "library-open", "landing-mode", "paper-choice", "sound-prompt", "offline-update",
  "standard",
  "account-link",
  "password-toggle",
  "tile", "review-item", "transcription-language", "domain-language",
] as const;
export type ButtonVariant = (typeof buttonVariants)[number];
/** D08: ordinary actions share one shape; intent and density are independent. */
export const buttonSizes = ["standard", "compact", "full-width", "touch"] as const;
export type ControlDensity = "standard" | "compact" | "touch";
export type ButtonIntent = "secondary" | "primary" | "danger" | "quiet";
export interface ButtonOptions {
  variant?: ButtonVariant;
  size?: (typeof buttonSizes)[number];
  intent?: ButtonIntent;
  pressed?: boolean;
  playing?: boolean;
}
export const iconButtonVariants = [
  "section-add", "player", "player-landscape", "player-zoom", "player-follow", "voice-more",
  "standard",
  "small",
  "library-more", "library-menu",
  "transcription",
  "admin-close",
  "admin-copy",
] as const;
export interface IconButtonOptions {
  variant?: (typeof iconButtonVariants)[number];
  size?: ControlDensity;
}
/** D09: normal forms use writing lines; boxed exceptions have explicit purposes. */
export const fieldVariants = [
  "panel-tempo", "panel-measure", "panel-export", "panel-offset",
  "player-volume",
  "account-password",
  "library-prompt",
  "library-search",
  "search", "numeric", "repeated-name",
  "ruled",
  "ruled-account",
  "domain",
  "domain-create",
  "transcription",
  "admin",
] as const;
export type FieldVariant = (typeof fieldVariants)[number];
export interface FieldOptions {
  variant?: FieldVariant;
  density?: ControlDensity;
  invalid?: boolean;
}
export const checkboxVariants = ["standard", "permission", "export", "export-voice"] as const;
export interface CheckboxOptions {
  variant?: (typeof checkboxVariants)[number];
  density?: ControlDensity;
}
export const switchVariants = ["player", "player-preference", "admin", "capability", "comparison", "shared-device"] as const;
export interface SwitchOptions {
  variant?: (typeof switchVariants)[number];
  density?: ControlDensity;
  checked?: boolean;
}

function missingArea(name: string): never { throw Error("Use app controls for " + name); }

export function createControlRecipes(extensions: {
 button?: (options: ButtonOptions) => string | undefined;
 iconButton?: (options: IconButtonOptions) => string | undefined;
 field?: (options: FieldOptions, kind: 'input' | 'select' | 'textarea') => Record<'root'|'label'|'control'|'hint'|'error', string> | undefined;
 checkbox?: (options: CheckboxOptions) => {root:string;control:string} | undefined;
 switch?: (options: SwitchOptions) => {label:string;input:string;root:string;thumb:string} | undefined;
} = {}) {

const parityButtonShapes = {
  "domain-language": "tw:min-h-panel tw:min-w-heading tw:px-flush tw:py-compact tw:rounded-card tw:border-0 tw:bg-transparent tw:font-auth-mono tw:font-weight-body tw:text-small tw:leading-leading-admin tw:text-center",
  tile: "tw:flex-1 tw:min-w-flush tw:min-h-upload-tile-height tw:max-score:min-h-upload-tile-phone-height tw:flex-col tw:px-inline tw:py-action tw:whitespace-normal tw:rounded-tile tw:bg-surface tw:text-ink tw:border-rule-strong tw:text-button tw:font-weight-label tw:font-auth-body tw:leading-leading-body",
  "review-item": "tw:min-h-control-height tw:w-full tw:mb-compact tw:justify-start tw:items-baseline tw:text-left tw:whitespace-normal tw:py-control tw:px-flush tw:border-0 tw:border-b-(length:--ds-stroke-thin) tw:rounded-field tw:border-rule-strong tw:bg-transparent tw:text-ink tw:font-auth-body tw:font-weight-body tw:text-body-small tw:leading-leading-field",
  "transcription-language": "tx-language-chip tw:min-h-toolbar-dense tw:rounded-field tw:px-flush tw:py-compact tw:border-0 tw:bg-transparent tw:font-auth-mono tw:font-weight-body tw:text-small tw:leading-leading-field",
} as const;
const buttonShapes = {
  "account-link": "tw:min-h-control-height-touch tw:min-w-control-target-touch tw:rounded-card tw:px-small tw:py-compact tw:text-body tw:font-weight-body tw:font-control",
  "password-toggle": "tw:min-h-control-height-touch tw:min-w-control-target-touch tw:rounded-card tw:px-small tw:py-compact tw:text-small tw:font-weight-body tw:font-control",
};
/** Compact is desktop density only. Phones, tablets and hybrid touch devices restore targets. */
function controlSizeRecipe(size: ControlDensity = "standard") {
  return size === "compact"
    ? "tw:min-h-control-height-compact tw:min-w-control-height-compact tw:px-control-padding-inline-compact tw:py-control-padding-block-compact tw:gap-control-gap-compact tw:touch:min-h-control-target-touch tw:touch:min-w-control-target-touch tw:touch:px-control-padding-inline tw:touch:py-control-padding-block tw:touch:gap-control-gap"
    : "tw:min-h-control-height-touch tw:min-w-control-target-touch tw:px-control-padding-inline tw:py-control-padding-block tw:gap-control-gap";
}
const ordinaryShape = "tw:rounded-card tw:font-control tw:text-button tw:font-weight-label";
const buttonIntents: Record<ButtonIntent, string> = {
  secondary:
    "tw:bg-transparent tw:text-ink tw:border-rule-strong tw:hover:border-ink-secondary",
  primary:
    "tw:bg-ink tw:text-surface-sunken tw:border-ink tw:hover:bg-component-action-hover",
  danger: "tw:bg-danger tw:text-on-danger tw:border-danger",
  quiet:
    "tw:bg-transparent tw:text-ink-secondary tw:border-transparent tw:hover:text-ink",
};
function actionRecipe(intent: ButtonIntent, pressed: boolean, variant: "standard"|"landing"|"library"|"scan-go"|"scan-ok") {
  const landing = variant === "landing";
  const colors: Record<ButtonIntent,string> = variant === "scan-ok" ? {
    secondary:"tw:bg-transparent tw:text-ink-secondary tw:border-transparent tw:hover:border-ink-secondary",
    primary:"tw:bg-ink tw:text-surface-sunken tw:border-transparent tw:hover:bg-action-hover",
    danger:"tw:bg-danger tw:text-on-danger tw:border-transparent",
    quiet:"tw:bg-transparent tw:text-ink-secondary tw:border-transparent tw:hover:text-ink",
  } : variant === "library" ? {...buttonIntents,danger:"tw:bg-danger tw:text-surface-sunken tw:border-danger"} : buttonIntents;
  return [landing ? controlBehavior + " " + controlFocus.standard : controlBase,
    actionDisabled, "tw:leading-leading-body tw:border-(length:--ds-stroke-thin) tw:border-solid tw:whitespace-nowrap tw:cursor-pointer tw:items-center tw:justify-center",
    landing ? "tw:block tw:rounded-card tw:text-button tw:font-weight-label tw:font-control tw:mx-auto tw:mt-action tw:text-center " + controlSizeRecipe() : "tw:inline-flex " + ordinaryShape + " " + controlSizeRecipe(),
    colors[intent], pressed ? "tw:shadow-emboss-pressed" : "",
    variant === "library" ? "tw:text-center" : variant === "scan-go" || variant === "scan-ok" ? "ds-panel-scan-button tw:flex-1 tw:text-center" + (variant === "scan-ok" ? " ds-panel-scan-quiet" : "") : "",
  ].join(" ");
}
function buttonRecipeStyles({
  variant = "standard",
  intent = "secondary",
  size = "standard",
  pressed = false,
  playing = false,
}: ButtonOptions = {}): string {
  const custom = extensions.button?.({variant, intent, size, pressed, playing});
  if (custom !== undefined) return custom;
  // D08/D10: retain account navigation and password reveal typography separately.
  if (variant === "account-link" || variant === "password-toggle")
    return [
      controlBase,
      "tw:disabled:opacity-(--ds-opacity-disabled-auth) tw:aria-disabled:opacity-(--ds-opacity-disabled-auth)",
      buttonShapes[variant as keyof typeof buttonShapes] ?? missingArea(variant),
      "tw:border-0 tw:bg-transparent tw:text-ink-secondary tw:cursor-pointer",
      variant === "account-link"
        ? "tw:inline-block tw:leading-(--ds-leading-account-links) tw:hover:text-ink tw:hover:underline"
        : "tw:block tw:absolute tw:right-flush tw:bottom-inline tw:leading-leading-admin tw:normal-case tw:tracking-(--ds-tracking-default)",
    ].join(" ");
  if (variant in parityButtonShapes) {
    const shape = parityButtonShapes[variant as keyof typeof parityButtonShapes];
    return [controlBase, ["tile", "review-item", "domain-language"].includes(variant) ? actionDisabled : disabledRecipe, "tw:inline-flex tw:gap-small tw:cursor-pointer", variant === "review-item" ? "tw:border-solid" : "tw:items-center tw:justify-center " + (["tile"].includes(variant) ? "tw:border-(length:--ds-stroke-thin) tw:border-solid" : ""), shape,
      (variant === "transcription-language" || variant === "domain-language") ? pressed ? "tw:text-ink" : "tw:text-ink-secondary" : "",
      variant === "tile" && pressed ? "tw:border-transcription-accent tw:shadow-transcription-selected" : "",
      ["review-item", "transcription-language", "domain-language"].includes(variant) ? "tw:touch:min-h-control-target-touch tw:touch:min-w-control-target-touch" : ""].join(" ");
  }
  if (variant !== "standard") missingArea(variant);
  return [controlBase, actionDisabled,
    "tw:inline-flex tw:items-center tw:justify-center tw:border-(length:--ds-stroke-thin) tw:border-solid tw:whitespace-nowrap tw:cursor-pointer tw:leading-leading-body",
    ordinaryShape, controlSizeRecipe(size === "full-width" ? "standard" : size),
    size === "full-width" ? "tw:w-full" : "", buttonIntents[intent],
    pressed ? "tw:shadow-emboss-pressed" : "",
  ].join(" ");
}

function iconButtonRecipeStyles({
  variant = "standard",
  size = "standard",
}: IconButtonOptions = {}) {
  const custom = extensions.iconButton?.({variant, size});
  if (custom !== undefined) return custom;
  const shapes: Partial<Record<NonNullable<IconButtonOptions["variant"]>, string>> = {
    "library-menu": "tw:size-toolbar tw:rounded-icon tw:p-flush tw:font-control tw:text-body tw:leading-leading-body tw:text-ink-secondary tw:hover:bg-surface-overlay tw:hover:text-ink",
    standard:
      "tw:size-toolbar tw:rounded-icon tw:p-flush tw:font-control tw:text-body tw:leading-leading-body tw:text-ink-secondary tw:hover:bg-surface-overlay tw:hover:text-ink",
    small:
      "tw:size-panel tw:rounded-icon tw:p-flush tw:font-control tw:text-body tw:leading-leading-body tw:text-ink-secondary tw:hover:bg-surface-overlay tw:hover:text-ink",
    transcription:
      "tw:size-toolbar tw:rounded-field tw:p-flush tw:font-close tw:font-weight-close-light tw:text-close tw:leading-leading-close tw:text-ink-secondary tw:hover:text-ink",
    "admin-close":
      "tw:w-auto tw:h-auto tw:rounded-control-dense tw:px-control tw:py-compact tw:font-close tw:text-admin-close tw:leading-leading-admin tw:text-admin-ink",
    "admin-copy":
      "tw:w-auto tw:h-auto tw:rounded-control-dense tw:p-compact tw:font-auth-mono tw:text-body-small tw:leading-leading-admin tw:text-admin-ink",
  };
  return [
    variant === "library-menu" ? unfocusedControlBase + " " + controlFocus.library : controlBase,
    variant.startsWith("admin") ? denseDisabled : disabledRecipe,
    (variant.startsWith("admin") ? "tw:inline-block tw:text-center " : "tw:inline-grid tw:place-items-center tw:flex-none ") + "tw:border-0 tw:bg-transparent tw:cursor-pointer",
    shapes[variant] ?? missingArea(variant),
    size === "compact" ? "tw:min-h-control-height-compact tw:min-w-control-height-compact tw:touch:min-h-control-target-touch tw:touch:min-w-control-target-touch" : "tw:min-h-control-target-touch tw:min-w-control-target-touch",
  ].join(" ");
}
function fieldRecipeStyles(
  { variant = "ruled", invalid = false, density = "standard" }: FieldOptions = {},
  kind: "input" | "select" | "textarea" = "input",
): Record<'root'|'label'|'control'|'hint'|'error', string> {
  const custom = extensions.field?.({variant, invalid, density}, kind);
  if (custom !== undefined) return custom;
  if (variant.startsWith("panel-") || ["player-volume", "account-password", "library-search"].includes(variant)) missingArea(variant);
  const admin = variant === "admin";
  const domain = variant === "domain" || variant === "domain-create";
  const prompt = variant === "library-prompt";
  const ruled = !["search", "numeric", "repeated-name"].includes(variant);
  return {
    root: variant === "domain-create" ? "tw:flex tw:flex-wrap tw:items-center tw:gap-(--ds-domain-label-gap) tw:min-w-flush" : variant === "ruled-account" ? "tw:block tw:mt-group tw:min-w-flush tw:font-auth-body " + (invalid ? "tw:mb-content" : "tw:mb-group") : admin ? "tw:grid tw:gap-snug tw:min-w-flush tw:font-auth-body tw:text-label tw:leading-leading-body tw:normal-case tw:tracking-(--ds-tracking-default) tw:tabular-nums" : "tw:grid tw:gap-snug tw:min-w-flush " + (variant === "ruled" || variant === "transcription" ? "tw:font-auth-body" : "tw:font-body"),
    label:
      variant === "domain-create" ? "tw:font-body tw:text-body tw:leading-leading-body tw:text-ink" : variant === "domain" ? "tw:font-auth-mono tw:text-caption tw:font-weight-medium tw:uppercase tw:tracking-(--ds-tracking-label) tw:leading-leading-admin tw:text-ink-secondary" : ruled && !admin
        ? (variant === "ruled-account" ? "tw:block " : "") + "tw:font-auth-mono tw:text-caption tw:font-weight-medium tw:uppercase tw:tracking-tracking-auth-label tw:leading-leading-field tw:text-ink-secondary"
        : admin ? "tw:normal-nums tw:text-label tw:font-auth-body tw:leading-leading-body tw:text-admin-secondary" : "tw:text-label tw:font-body tw:leading-leading-body tw:text-ink-secondary",
    control: [
      admin ? adminControlBase : variant === "ruled" || variant === "transcription" ? unfocusedControlBase : prompt ? unfocusedControlBase + " tw:outline-none tw:outline-offset-(--ds-space-micro)" : controlBase,
      variant === "ruled" || variant === "transcription" ? "" : disabledRecipe,
      "tw:block tw:w-full tw:font-weight-body tw:disabled:cursor-default" + (admin ? " tw:tabular-nums" : ""),
      "tw:font-control tw:text-input tw:leading-leading-field tw:text-ink " + (ruled
        ? "tw:rounded-field tw:border-0 tw:border-b-(length:--ds-stroke-thin) tw:border-solid tw:bg-transparent"
        : "tw:rounded-card tw:border-(length:--ds-stroke-thin) tw:border-solid tw:bg-surface"),
      kind === "textarea" ? "tw:h-auto tw:min-h-control-textarea-height tw:resize-y tw:px-control-padding-inline tw:py-control-padding-block" : controlSizeRecipe(density),
      invalid
        ? "tw:border-danger"
        : admin
          ? "tw:border-admin-rule"
          : domain && kind === "select"
            ? "tw:border-rule-strong"
            : domain ? "tw:border-ink-secondary"
            : ruled
              ? "tw:border-ink-secondary tw:focus:border-focus"
              : "tw:border-rule-strong tw:focus:border-ink-secondary",
      ruled && !admin && !domain ? "tw:focus:shadow-focus" : "",
      admin ? "" : "tw:focus:outline-none",
    ].join(" "),
    hint: "tw:m-flush tw:text-label tw:font-body tw:leading-leading-body tw:text-ink-secondary",
    error: "tw:m-flush tw:text-label tw:font-control tw:leading-leading-body tw:text-danger",
  };
}
function inputRecipeStyles(options: FieldOptions = {}) {
  return fieldRecipe(options).control;
}
function selectRecipeStyles(options: FieldOptions = {}) {
  return fieldRecipe(options, "select").control;
}
function textareaRecipeStyles(options: FieldOptions = {}) {
  return fieldRecipe(options, "textarea").control;
}
function checkboxRecipeStyles({ variant = "standard", density = "standard" }: CheckboxOptions = {}) {
  const custom = extensions.checkbox?.({variant, density});
  if (custom !== undefined) return custom;
  if (variant === "export-voice") missingArea(variant);
  return {
    root: "tw:inline-flex tw:items-center tw:font-control tw:text-label tw:leading-leading-body tw:text-ink tw:cursor-pointer " + controlSizeRecipe(density),
    control:
      controlBase +
      " " +
      disabledRecipe +
      " tw:appearance-auto tw:leading-leading-body tw:p-flush tw:shrink-0 " +
      (variant === "permission"
        ? "tw:size-group tw:accent-admin-accent tw:mt-tight tw:mr-tight tw:mb-tight tw:ml-compact"
        : "tw:size-action tw:accent-accent"),
  };
}
function switchRecipeStyles({
  variant = "player",
  checked = false,
  density = "standard",
}: SwitchOptions = {}) {
  const custom = extensions.switch?.({variant, checked, density});
  if (custom !== undefined) return custom;
  if (variant === "player-preference") throw Error("Use app controls for " + variant);
  return {
    label: "tw:relative tw:inline-flex tw:items-center tw:font-control tw:text-label tw:leading-leading-body tw:text-ink tw:cursor-pointer " + controlSizeRecipe(density),
    input: "tw:sr-only tw:peer",
    root: controlBase + " " + disabledRecipe + " tw:relative tw:inline-flex tw:items-center tw:shrink-0 tw:w-switch tw:min-w-control-target-touch tw:rounded-pill tw:border-(length:--ds-stroke-thin) tw:border-solid tw:px-compact tw:py-flush tw:cursor-pointer tw:peer-focus-visible:outline-solid tw:peer-focus-visible:outline-(length:--ds-stroke-focus) tw:peer-focus-visible:outline-focus tw:peer-focus-visible:outline-offset-(--ds-space-compact) tw:peer-disabled:opacity-(--ds-opacity-disabled) " + (density === "compact" ? "tw:min-h-control-height-compact tw:touch:min-h-control-target-touch " : "tw:min-h-control-target-touch ") + (checked ? "tw:bg-accent tw:border-accent" : "tw:bg-surface-hover tw:border-rule-strong"),
    thumb: "tw:block tw:size-section tw:rounded-round tw:shrink-0 tw:transition-transform tw:duration-switch tw:motion-reduce:transition-none " + (checked ? "tw:bg-on-accent tw:translate-x-group" : "tw:bg-ink-secondary"),
  };
}
function buttonRecipe(
  ...args: Parameters<typeof buttonRecipeStyles>
): ReturnType<typeof buttonRecipeStyles> {
  return normalizeRecipe(buttonRecipeStyles(...args));
}
function iconButtonRecipe(
  ...args: Parameters<typeof iconButtonRecipeStyles>
): ReturnType<typeof iconButtonRecipeStyles> {
  return normalizeRecipe(iconButtonRecipeStyles(...args));
}
function fieldRecipe(
  ...args: Parameters<typeof fieldRecipeStyles>
): ReturnType<typeof fieldRecipeStyles> {
  return normalizeRecipe(fieldRecipeStyles(...args));
}
function inputRecipe(
  ...args: Parameters<typeof inputRecipeStyles>
): ReturnType<typeof inputRecipeStyles> {
  return normalizeRecipe(inputRecipeStyles(...args));
}
function selectRecipe(
  ...args: Parameters<typeof selectRecipeStyles>
): ReturnType<typeof selectRecipeStyles> {
  return normalizeRecipe(selectRecipeStyles(...args));
}
function textareaRecipe(
  ...args: Parameters<typeof textareaRecipeStyles>
): ReturnType<typeof textareaRecipeStyles> {
  return normalizeRecipe(textareaRecipeStyles(...args));
}
function checkboxRecipe(
  ...args: Parameters<typeof checkboxRecipeStyles>
): ReturnType<typeof checkboxRecipeStyles> {
  return normalizeRecipe(checkboxRecipeStyles(...args));
}
function switchRecipe(
  ...args: Parameters<typeof switchRecipeStyles>
): ReturnType<typeof switchRecipeStyles> {
  return normalizeRecipe(switchRecipeStyles(...args));
}

/** A positioning slot for a native control with an adjacent action. */
function controlGroupRecipe() {
  return normalizeRecipe("tw:block tw:relative");
}
return { buttonRecipe, iconButtonRecipe, fieldRecipe, inputRecipe, selectRecipe, textareaRecipe, checkboxRecipe, switchRecipe, controlGroupRecipe, actionRecipe };
}
export const { buttonRecipe, iconButtonRecipe, fieldRecipe, inputRecipe, selectRecipe, textareaRecipe, checkboxRecipe, switchRecipe, controlGroupRecipe, actionRecipe } = /* @__PURE__ */ createControlRecipes();
