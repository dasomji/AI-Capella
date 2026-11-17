import { normalizeRecipe } from "./normalize";
/** Pure, literal Tailwind recipes. Each property owns disjoint CSS properties. */
export const controlBase =
  "tw:box-border tw:m-0 tw:focus-visible:outline-solid tw:focus-visible:outline-2 tw:focus-visible:outline-focus tw:focus-visible:outline-offset-4 tw:disabled:cursor-default tw:aria-disabled:cursor-wait tw:motion-reduce:transition-none";
export const disabledRecipe =
  "tw:disabled:opacity-(--ds-opacity-disabled) tw:aria-disabled:opacity-(--ds-opacity-disabled)";
const denseDisabled =
  "tw:disabled:opacity-(--ds-opacity-disabled-admin) tw:aria-disabled:opacity-(--ds-opacity-disabled-admin)";
export const buttonVariants = [
  "standard",
  "cta",
  "pill",
  "tour",
  "dense",
  "dense-sort",
  "link",
  "account-link",
  "password-toggle",
  "tile", "compact", "review-item", "transcription-link", "transcription-language", "tour-link", "hint-link", "hint", "domain-language",
] as const;
export type ButtonVariant = (typeof buttonVariants)[number];
/** tour: danger=primary, quiet=secondary (D17); dense: primary/quiet=secondary (D10). */
export type ButtonIntent = "secondary" | "primary" | "danger" | "quiet";
export interface ButtonOptions {
  variant?: ButtonVariant;
  intent?: ButtonIntent;
  pressed?: boolean;
}
const parityButtonShapes = {
  "domain-language": "tw:min-h-32 tw:min-w-28 tw:px-0 tw:py-4 tw:rounded-card tw:border-0 tw:bg-transparent tw:font-auth-mono tw:font-label tw:text-small tw:leading-admin tw:text-center",
  tile: "tw:flex-1 tw:min-w-0 tw:min-h-upload-tile tw:max-score:min-h-upload-tile-phone tw:flex-col tw:px-10 tw:py-18 tw:whitespace-normal tw:rounded-transcription-tile tw:bg-surface tw:text-ink tw:border-rule-strong tw:text-button tw:font-label tw:font-auth-body tw:leading-body",
  compact: "tw:min-h-36 tw:p-6 tw:rounded-card tw:border-rule-strong tw:bg-transparent tw:text-ink tw:text-small tw:font-label tw:font-auth-body tw:leading-body",
  "review-item": "tw:min-h-control-height tw:w-full tw:mb-4 tw:justify-start tw:items-baseline tw:text-left tw:whitespace-normal tw:py-12 tw:px-0 tw:border-0 tw:border-b tw:rounded-field tw:border-rule-strong tw:bg-transparent tw:text-ink tw:font-auth-body tw:font-regular tw:text-body-small tw:leading-field",
  "transcription-link": "tw:min-h-0 tw:rounded-field tw:px-0 tw:py-8 tw:border-0 tw:bg-transparent tw:text-ink-secondary tw:hover:text-ink tw:hover:underline tw:font-auth-body tw:font-regular tw:text-label tw:leading-field",
  "transcription-language": "tw:min-h-36 tw:rounded-field tw:px-0 tw:py-4 tw:border-0 tw:bg-transparent tw:font-auth-mono tw:font-regular tw:text-small tw:leading-field",
  "tour-link": "tw:min-h-0 tw:rounded-control tw:px-6 tw:py-4 tw:border-0 tw:bg-transparent tw:text-note-secondary tw:hover:text-surface-sunken tw:font-control tw:text-label tw:font-label tw:leading-body",
  "hint-link": "tw:min-h-0 tw:rounded-control tw:px-6 tw:py-4 tw:border-0 tw:bg-transparent tw:text-hint-secondary tw:hover:text-surface-sunken tw:font-control tw:text-label tw:font-label tw:leading-body",
  hint: "tw:min-h-control-height tw:rounded-card tw:px-18 tw:py-0 tw:text-button tw:font-label tw:font-control tw:leading-body tw:border-rule-strong tw:hover:border-ink-secondary tw:bg-transparent tw:text-surface-sunken",
} as const;
const buttonShapes: Record<Exclude<ButtonVariant, keyof typeof parityButtonShapes>, string> = {
  standard:
    "tw:min-h-control-height tw:rounded-card tw:px-18 tw:py-0 tw:text-button tw:font-label tw:font-control",
  cta: "tw:min-h-control-height-auth tw:rounded-card tw:px-18 tw:py-0 tw:w-full tw:text-button tw:font-label tw:font-auth-body",
  pill: "tw:min-h-control-height-transcription tw:rounded-chip tw:px-18 tw:py-0 tw:text-button tw:font-label tw:font-auth-body",
  tour: "tw:min-h-tour tw:rounded-card tw:px-16 tw:py-0 tw:text-button tw:font-label tw:font-control",
  dense:
    "tw:min-h-control-height-admin tw:rounded-admin-control tw:px-14 tw:py-10 tw:text-body-small tw:font-regular tw:font-auth-mono",
  "dense-sort": "tw:min-h-control-height-admin tw:rounded-admin-control tw:px-0 tw:py-0 tw:text-body-small tw:font-regular tw:font-auth-mono",
  "account-link": "tw:min-h-0 tw:rounded-field tw:px-0 tw:py-4 tw:text-body tw:font-regular tw:font-auth-body",
  "password-toggle": "tw:min-h-0 tw:rounded-field tw:px-0 tw:py-4 tw:text-small tw:font-regular tw:font-auth-mono",
  link: "tw:min-h-32 tw:rounded-field tw:px-0 tw:py-4 tw:text-label tw:font-label tw:font-control",
};
const buttonIntents: Record<ButtonIntent, string> = {
  secondary:
    "tw:bg-transparent tw:text-ink tw:border-rule-strong tw:hover:border-ink-secondary",
  primary:
    "tw:bg-ink tw:text-surface-sunken tw:border-ink tw:hover:bg-action-hover",
  danger: "tw:bg-danger tw:text-on-danger tw:border-danger",
  quiet:
    "tw:bg-transparent tw:text-ink-secondary tw:border-transparent tw:hover:text-ink",
};
function buttonRecipeStyles({
  variant = "standard",
  intent = "secondary",
  pressed = false,
}: ButtonOptions = {}) {
  // D08/D10: retain account navigation and password reveal typography separately.
  if (variant === "account-link" || variant === "password-toggle")
    return [
      controlBase,
      "tw:disabled:opacity-(--ds-opacity-disabled-auth) tw:aria-disabled:opacity-(--ds-opacity-disabled-auth)",
      buttonShapes[variant as keyof typeof buttonShapes],
      "tw:border-0 tw:bg-transparent tw:text-ink-secondary tw:cursor-pointer",
      variant === "account-link"
        ? "tw:inline-block tw:leading-(--ds-leading-account-links) tw:hover:text-ink tw:hover:underline"
        : "tw:block tw:absolute tw:right-0 tw:bottom-10 tw:leading-admin tw:normal-case tw:tracking-normal",
    ].join(" ");
  if (variant in parityButtonShapes) {
    const shape = parityButtonShapes[variant as keyof typeof parityButtonShapes];
    return [controlBase, disabledRecipe, "tw:inline-flex tw:gap-8 tw:cursor-pointer", variant === "review-item" ? "tw:border-solid" : "tw:items-center tw:justify-center " + (["tile","compact","hint"].includes(variant) ? "tw:border tw:border-solid" : ""), shape,
      (variant === "transcription-language" || variant === "domain-language") ? pressed ? "tw:text-ink" : "tw:text-ink-secondary" : "",
      variant === "tile" && pressed ? "tw:border-transcription-accent tw:shadow-transcription-selected" : ""].join(" ");
  }
  const color =
    variant === "tour"
      ? intent === "secondary" || intent === "quiet"
        ? "tw:bg-transparent tw:text-surface-sunken tw:border-tour-rule"
        : "tw:bg-surface tw:text-ink tw:border-surface tw:hover:bg-surface-overlay"
      : variant === "dense-sort" ? "tw:bg-transparent tw:text-admin-accent tw:border-transparent" : variant === "dense"
        ? intent === "danger"
          ? "tw:bg-transparent tw:text-admin-danger tw:border-admin-danger"
          : "tw:bg-transparent tw:text-admin-ink tw:border-admin-rule"
        : buttonIntents[intent];
  return [
    variant.startsWith("dense") ? controlBase.replace("outline-focus", "outline-admin-accent").replace("outline-offset-4", "outline-offset-3") : controlBase,
    variant.startsWith("dense") ? denseDisabled : disabledRecipe,
    variant.startsWith("dense") ? "tw:leading-admin tw:normal-nums" : "tw:leading-body",
    (variant.startsWith("dense") ? (variant==="dense-sort"?"tw:inline-block ":"tw:inline-block tw:text-center ") : "tw:inline-flex tw:items-center tw:justify-center tw:gap-8 ") + "tw:border-solid tw:whitespace-nowrap tw:cursor-pointer " + (variant === "dense-sort" ? "tw:border-0 tw:text-left" : "tw:border"),
    buttonShapes[variant as keyof typeof buttonShapes],
    color,
    pressed ? "tw:shadow-emboss-pressed" : "",
  ].join(" ");
}
export const iconButtonVariants = [
  "standard",
  "small",
  "transcription",
  "admin-close",
  "admin-copy",
] as const;
export interface IconButtonOptions {
  variant?: (typeof iconButtonVariants)[number];
}
function iconButtonRecipeStyles({
  variant = "standard",
}: IconButtonOptions = {}) {
  const shapes: Record<NonNullable<IconButtonOptions["variant"]>, string> = {
    standard:
      "tw:min-h-0 tw:size-40 tw:rounded-icon tw:p-0 tw:font-control tw:text-body tw:leading-body tw:text-ink-secondary tw:hover:bg-surface-overlay tw:hover:text-ink",
    small:
      "tw:min-h-0 tw:size-32 tw:rounded-icon tw:p-0 tw:font-control tw:text-body tw:leading-body tw:text-ink-secondary tw:hover:bg-surface-overlay tw:hover:text-ink",
    transcription:
      "tw:min-h-0 tw:size-40 tw:rounded-field tw:p-0 tw:font-close tw:font-close-light tw:text-close tw:leading-close tw:text-ink-secondary tw:hover:text-ink",
    "admin-close":
      "tw:min-h-44 tw:w-auto tw:h-auto tw:rounded-admin-control tw:px-12 tw:py-4 tw:font-close tw:text-admin-close tw:leading-admin tw:text-admin-ink",
    "admin-copy":
      "tw:min-h-32 tw:w-auto tw:h-auto tw:rounded-admin-control tw:p-4 tw:font-auth-mono tw:text-body-small tw:leading-admin tw:text-admin-ink",
  };
  return [
    controlBase,
    variant.startsWith("admin") ? denseDisabled : disabledRecipe,
    (variant.startsWith("admin") ? "tw:inline-block tw:text-center " : "tw:inline-grid tw:place-items-center tw:flex-none ") + "tw:border-0 tw:bg-transparent tw:cursor-pointer",
    shapes[variant],
  ].join(" ");
}
/** ruled/transcription intentionally preserve identical looks pending D09/D10. */
export const fieldVariants = [
  "boxed",
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
  invalid?: boolean;
}
function fieldRecipeStyles(
  { variant = "boxed", invalid = false }: FieldOptions = {},
  kind: "input" | "select" | "textarea" = "input",
) {
  const admin = variant === "admin";
  const domain = variant === "domain" || variant === "domain-create";
  const ruled = variant !== "boxed";
  return {
    root: variant === "domain-create" ? "tw:flex tw:flex-wrap tw:items-center tw:gap-(--ds-domain-label-gap) tw:min-w-0" : variant === "ruled-account" ? "tw:block tw:mt-20 tw:min-w-0 tw:font-auth-body " + (invalid ? "tw:mb-16" : "tw:mb-20") : admin ? "tw:grid tw:gap-6 tw:min-w-0 tw:font-auth-body tw:text-label tw:leading-body tw:tabular-nums" : "tw:grid tw:gap-6 tw:min-w-0 tw:font-body",
    label:
      variant === "domain-create" ? "tw:font-body tw:text-body tw:leading-body tw:text-ink" : ruled && !admin
        ? (variant === "ruled-account" ? "tw:block " : "") + "tw:font-auth-mono tw:text-caption tw:font-emphasis tw:uppercase tw:tracking-auth-label tw:leading-field tw:text-ink-secondary"
        : admin ? "tw:text-label tw:font-auth-body tw:leading-body tw:text-admin-secondary" : "tw:text-label tw:font-body tw:leading-body tw:text-ink-secondary",
    control: [
      admin ? controlBase.replace("outline-focus", "outline-admin-accent").replace("outline-offset-4", "outline-offset-3") : controlBase,
      disabledRecipe,
      "tw:block tw:w-full tw:min-w-0 tw:font-regular tw:disabled:cursor-default" + (admin ? " tw:tabular-nums" : ""),
      kind === "textarea" && admin
        ? "tw:h-auto tw:min-h-textarea tw:resize-y tw:border tw:border-solid tw:rounded-field tw:p-10 tw:font-auth-body tw:text-body tw:leading-admin tw:bg-admin-surface tw:text-admin-ink"
        : domain && kind === "select"
          ? "tw:rounded-field tw:border-0 tw:border-b tw:border-solid tw:px-8 tw:py-8 tw:leading-body tw:bg-transparent tw:text-ink tw:font-control tw:text-body"
          : ruled
            ? `tw:rounded-field tw:border-0 tw:border-b tw:border-solid ${domain ? "tw:py-8 tw:leading-admin" : admin ? "tw:py-10 tw:leading-body" : "tw:py-10 tw:leading-field"} ${admin ? "tw:px-2 tw:bg-admin-surface tw:text-admin-ink tw:font-auth-body tw:text-label" : domain ? "tw:px-0 tw:bg-transparent tw:text-ink tw:font-auth-body tw:text-body" : "tw:px-0 tw:bg-transparent tw:text-ink tw:font-auth-body tw:text-input"}`
            : (kind === "textarea"
                ? "tw:h-auto tw:min-h-textarea tw:resize-y tw:p-10"
                : "tw:h-control-height tw:px-12 tw:py-0") +
              " tw:rounded-card tw:border tw:border-solid tw:bg-surface tw:text-ink tw:font-control tw:text-body tw:leading-body",
      invalid && variant !== "ruled-account"
        ? "tw:border-danger"
        : admin
          ? "tw:border-admin-rule tw:focus:border-focus"
          : domain && kind === "select"
            ? "tw:border-rule-strong tw:focus:border-focus"
            : ruled
              ? "tw:border-ink-secondary tw:focus:border-focus"
              : "tw:border-rule-strong tw:focus:border-ink-secondary",
      ruled && !admin ? "tw:focus:shadow-focus" : "",
      admin ? "" : "tw:focus:outline-none",
    ].join(" "),
    hint: "tw:m-0 tw:text-label tw:font-body tw:leading-body tw:text-ink-secondary",
    error: variant === "ruled-account" ? "tw:block tw:mt-20 tw:mb-16 tw:text-body tw:font-auth-body tw:leading-account tw:text-center tw:text-danger" : "tw:m-0 tw:text-label tw:font-body tw:leading-body tw:text-danger",
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
export const checkboxVariants = ["standard", "permission", "export"] as const;
export interface CheckboxOptions {
  variant?: (typeof checkboxVariants)[number];
}
function checkboxRecipeStyles({ variant = "standard" }: CheckboxOptions = {}) {
  return {
    root: "tw:inline-flex tw:items-center tw:gap-8 tw:font-auth-body tw:text-label tw:leading-body " + (variant === "permission" ? "tw:text-admin-ink" : "tw:text-ink"),
    control:
      controlBase +
      " " +
      disabledRecipe +
      " tw:appearance-auto tw:p-0 tw:shrink-0 " +
      (variant === "permission"
        ? "tw:size-20 tw:accent-admin-accent tw:mt-3 tw:mr-3 tw:mb-3 tw:ml-4"
        : "tw:size-18 tw:accent-accent"),
  };
}
export const switchVariants = ["player", "admin", "capability", "comparison"] as const;
export interface SwitchOptions {
  variant?: (typeof switchVariants)[number];
  checked?: boolean;
}
function switchRecipeStyles({
  variant = "player",
  checked = false,
}: SwitchOptions = {}) {
  const sizes = {
    player: "tw:w-52 tw:h-32 tw:p-4",
    admin: "tw:w-48 tw:h-26 tw:p-0",
    capability: "tw:w-28 tw:h-16 tw:p-2",
    comparison: "tw:w-28 tw:h-16 tw:p-2",
  };
  const thumbs = {
    player: "tw:size-24",
    admin: "tw:size-18",
    capability: "tw:size-10",
    comparison: "tw:size-10",
  };
  return {
    label:
      "tw:relative tw:inline-flex tw:items-center tw:gap-8 tw:font-auth-body tw:text-small tw:text-ink-secondary tw:cursor-pointer" + (variant === "capability" ? " tw:min-h-32 tw:flex-nowrap" : variant === "comparison" ? " tw:min-h-36 tw:my-24 tw:text-label" : ""),
    input: variant === "capability" || variant === "comparison" ? "tw:absolute tw:opacity-0 tw:w-28 tw:h-24 tw:m-0 tw:peer" : "tw:sr-only tw:peer",
    root:
      controlBase +
      " " +
      (variant === "admin" ? denseDisabled : disabledRecipe) +
      (variant === "admin" ? " tw:min-h-26 tw:font-auth-mono tw:text-body-small tw:leading-admin tw:relative tw:inline-block tw:shrink-0 tw:rounded-chip tw:border-solid tw:cursor-pointer " :
      " tw:peer-focus-visible:outline-solid tw:peer-focus-visible:outline-2 tw:peer-focus-visible:outline-focus tw:peer-focus-visible:outline-offset-4 tw:peer-disabled:opacity-(--ds-opacity-disabled) tw:min-h-0 tw:leading-body tw:relative tw:inline-flex tw:items-center tw:shrink-0 tw:rounded-chip tw:border-solid tw:cursor-pointer ") +
      sizes[variant] +
      " " +
      (variant === "player"
        ? "tw:border-0 " + (checked ? "tw:bg-ink" : "tw:bg-surface-hover")
        : "tw:border " +
          (checked
            ? variant === "admin"
              ? "tw:bg-admin-accent tw:border-admin-secondary"
              : "tw:bg-accent tw:border-accent"
            : "tw:bg-transparent tw:border-ink-secondary")),
    thumb:
      (variant === "admin" ? "tw:absolute tw:left-3 tw:top-3 " : "") + "tw:block tw:rounded-round tw:shrink-0 tw:transition-transform tw:duration-switch tw:motion-reduce:transition-none " +
      thumbs[variant] +
      " " +
      (checked
        ? "tw:bg-surface-sunken " +
          {
            player: "tw:translate-x-20",
            admin: "tw:translate-x-switch-admin",
            capability: "tw:translate-x-12",
            comparison: "tw:translate-x-12",
          }[variant]
        : variant === "player"
          ? "tw:bg-ink-secondary"
          : "tw:bg-ink"),
  };
}
export function buttonRecipe(
  ...args: Parameters<typeof buttonRecipeStyles>
): ReturnType<typeof buttonRecipeStyles> {
  return normalizeRecipe(buttonRecipeStyles(...args));
}
export function iconButtonRecipe(
  ...args: Parameters<typeof iconButtonRecipeStyles>
): ReturnType<typeof iconButtonRecipeStyles> {
  return normalizeRecipe(iconButtonRecipeStyles(...args));
}
export function fieldRecipe(
  ...args: Parameters<typeof fieldRecipeStyles>
): ReturnType<typeof fieldRecipeStyles> {
  return normalizeRecipe(fieldRecipeStyles(...args));
}
export function inputRecipe(
  ...args: Parameters<typeof inputRecipeStyles>
): ReturnType<typeof inputRecipeStyles> {
  return normalizeRecipe(inputRecipeStyles(...args));
}
export function selectRecipe(
  ...args: Parameters<typeof selectRecipeStyles>
): ReturnType<typeof selectRecipeStyles> {
  return normalizeRecipe(selectRecipeStyles(...args));
}
export function textareaRecipe(
  ...args: Parameters<typeof textareaRecipeStyles>
): ReturnType<typeof textareaRecipeStyles> {
  return normalizeRecipe(textareaRecipeStyles(...args));
}
export function checkboxRecipe(
  ...args: Parameters<typeof checkboxRecipeStyles>
): ReturnType<typeof checkboxRecipeStyles> {
  return normalizeRecipe(checkboxRecipeStyles(...args));
}
export function switchRecipe(
  ...args: Parameters<typeof switchRecipeStyles>
): ReturnType<typeof switchRecipeStyles> {
  return normalizeRecipe(switchRecipeStyles(...args));
}

/** A positioning slot for a native control with an adjacent action. */
export function controlGroupRecipe() {
  return normalizeRecipe("tw:block tw:relative");
}
