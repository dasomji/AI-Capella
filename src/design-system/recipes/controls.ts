import { libraryControlRecipe, libraryMoreRecipe, librarySearchRecipe, offlineUpdateRecipe, type LibraryControl } from "./library";
import { accountFieldRecipe, sharedDeviceRecipe } from "./account";
import { panelButtonStyles, panelSectionMarkStyles, panelInputStyles, panelCheckboxStyles, panelPartRecipe } from "./panels";
import { playerControlRecipe, type PlayerControl } from "./player";
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

  "ensemble-switch", "ensemble-other", "device-link", "account-delete-confirm",
  "landing-create", "library-action", "landing-link", "landing-aside", "library-open", "landing-mode", "paper-choice", "sound-prompt", "offline-update",
  "standard", "job-action",
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
  playing?: boolean;
}
const playerButtonShapes = {"player-back": "ds-player-button ds-player-back-btn back-btn", "player-mode": "ds-player-button ds-player-badge badge", "player-info": "ds-player-button ds-player-info-row info-row", "player-position": "ds-player-button ds-player-pos pos", "player-transport": "ds-player-button ds-player-t-btn t-btn", "player-stop-left": "ds-player-button ds-player-t-btn ds-player-t-stop-left t-btn t-stop-left", "player-stop-mid": "ds-player-button ds-player-t-btn ds-player-t-stop-mid t-btn t-stop-mid", "player-play": "ds-player-button ds-player-play-btn play-btn", "player-toggle": "ds-player-button ds-player-t-btn ds-player-toggle t-btn toggle", "player-preference": "ds-player-button ds-player-t-btn ds-player-toggle ds-player-t-metro t-btn toggle t-metro", "player-save": "ds-player-button ds-player-t-btn ds-player-t-save t-btn t-save", "player-voice-name": "ds-player-button ds-player-voice-name voice-name", "player-voice-name-long": "ds-player-button ds-player-voice-name ds-player-long voice-name long", "player-mute": "ds-player-button ds-player-mix-btn ds-player-mute-btn mix-btn mute-btn", "player-solo": "ds-player-button ds-player-mix-btn ds-player-solo-btn mix-btn solo-btn", "player-chip": "ds-player-button ds-player-chip chip", "player-mixer-chip": "ds-player-button ds-player-chip ds-player-mixer-chip chip mixer-chip", "player-segmented": "ds-player-button ds-player-seg-item seg-item", "player-reset": "ds-player-button ds-player-reset player-reset"} as const;
const parityButtonShapes = {
  ...playerButtonShapes,
  "ensemble-switch": "ds-navigation-switch ens-switch",
  "ensemble-other": "ds-navigation-other ded-other",
  "device-link": "ds-library-link",
  "account-delete-confirm": "ds-account-delete-confirm",
  "landing-create": "",
  "library-action": "",
  "landing-link": "ds-library-link",
  "landing-aside": "ds-library-link ds-library-landing-aside",
  "library-open": "ds-library-song-open song-open",
  "landing-mode": "ds-library-mode-btn mode-btn",
  "paper-choice": "ds-library-paper-option",
  "sound-prompt": "ds-library-sound-prompt",
  "offline-update": "ds-library-offline-update",
  "domain-language": "tw:min-h-panel tw:min-w-heading tw:px-flush tw:py-compact tw:rounded-card tw:border-0 tw:bg-transparent tw:font-auth-mono tw:font-weight-body tw:text-small tw:leading-leading-admin tw:text-center",
  tile: "tw:flex-1 tw:min-w-flush tw:min-h-upload-tile-height tw:max-score:min-h-upload-tile-phone-height tw:flex-col tw:px-inline tw:py-action tw:whitespace-normal tw:rounded-tile tw:bg-surface tw:text-ink tw:border-rule-strong tw:text-button tw:font-weight-label tw:font-auth-body tw:leading-leading-body",
  compact: "tw:min-h-toolbar-dense tw:p-snug tw:rounded-card tw:border-rule-strong tw:bg-transparent tw:text-ink tw:text-small tw:font-weight-label tw:font-auth-body tw:leading-leading-body",
  "review-item": "tw:min-h-control-height tw:w-full tw:mb-compact tw:justify-start tw:items-baseline tw:text-left tw:whitespace-normal tw:py-control tw:px-flush tw:border-0 tw:border-b-(length:--ds-stroke-thin) tw:rounded-field tw:border-rule-strong tw:bg-transparent tw:text-ink tw:font-auth-body tw:font-weight-body tw:text-body-small tw:leading-leading-field",
  "transcription-link": "tw:min-h-flush tw:rounded-field tw:px-flush tw:py-small tw:border-0 tw:bg-transparent tw:text-ink-secondary tw:hover:text-ink tw:hover:underline tw:font-auth-body tw:font-weight-body tw:text-label tw:leading-leading-body",
  "transcription-language": "tw:min-h-toolbar-dense tw:rounded-field tw:px-flush tw:py-compact tw:border-0 tw:bg-transparent tw:font-auth-mono tw:font-weight-body tw:text-small tw:leading-leading-field",
  "tour-link": "tw:min-h-flush tw:rounded-control tw:px-snug tw:py-compact tw:border-0 tw:bg-transparent tw:text-note-secondary tw:hover:text-surface-sunken tw:font-control tw:text-label tw:font-weight-label tw:leading-leading-body",
  "hint-link": "tw:min-h-flush tw:rounded-control tw:px-snug tw:py-compact tw:border-0 tw:bg-transparent tw:text-hint-secondary tw:hover:text-surface-sunken tw:font-control tw:text-label tw:font-weight-label tw:leading-leading-body",
  hint: "tw:min-h-control-height tw:rounded-card tw:px-action tw:py-flush tw:text-button tw:font-weight-label tw:font-control tw:leading-leading-body tw:border-rule-strong tw:hover:border-ink-secondary tw:bg-transparent tw:text-surface-sunken",
} as const;
const buttonShapes: Record<Exclude<ButtonVariant, "scan-mark-go" | "scan-mark-ok" | keyof typeof panelButtons | keyof typeof parityButtonShapes>, string> = {
  "job-action": "tw:min-h-control-height tw:rounded-card tw:px-action tw:py-flush tw:text-button tw:font-weight-label tw:font-auth-body",
  standard:
    "tw:min-h-control-height tw:rounded-card tw:px-action tw:py-flush tw:text-button tw:font-weight-label tw:font-control",
  cta: "tw:min-h-control-height-touch tw:rounded-card tw:px-action tw:py-flush tw:w-full tw:text-button tw:font-weight-label tw:font-auth-body",
  pill: "tw:min-h-control-height-touch tw:rounded-pill tw:px-action tw:py-flush tw:text-button tw:font-weight-label tw:font-auth-body",
  tour: "tw:min-h-control-height-tour tw:rounded-card tw:px-content tw:py-flush tw:text-button tw:font-weight-label tw:font-control",
  dense:
    "tw:min-h-control-height-touch tw:rounded-control-dense tw:px-row tw:py-inline tw:text-body-small tw:font-weight-body tw:font-auth-mono",
  "dense-sort": "tw:min-h-control-height-touch tw:rounded-control-dense tw:px-flush tw:py-flush tw:text-body-small tw:font-weight-body tw:font-auth-mono",
  "account-link": "tw:min-h-flush tw:rounded-field tw:px-flush tw:py-compact tw:text-body tw:font-weight-body tw:font-auth-body",
  "password-toggle": "tw:min-h-flush tw:rounded-field tw:px-flush tw:py-compact tw:text-small tw:font-weight-body tw:font-auth-mono",
  link: "tw:min-h-panel tw:rounded-field tw:px-flush tw:py-compact tw:text-label tw:font-weight-label tw:font-control",
};
const buttonIntents: Record<ButtonIntent, string> = {
  secondary:
    "tw:bg-transparent tw:text-ink tw:border-rule-strong tw:hover:border-ink-secondary",
  primary:
    "tw:bg-ink tw:text-surface-sunken tw:border-ink tw:hover:bg-component-action-hover",
  danger: "tw:bg-danger tw:text-on-danger tw:border-danger",
  quiet:
    "tw:bg-transparent tw:text-ink-secondary tw:border-transparent tw:hover:text-ink",
};
const panelButtons = {
 "panel-step":"ds-panel-button", "panel-tempo":"ds-panel-button ds-panel-stepper-value stepper-value", "panel-round":"ds-panel-button ds-panel-round-btn round-btn", "panel-preset":"ds-panel-button ds-panel-bpm-preset bpm-preset", "section-mark":"ds-panel-button ds-panel-rmark rmark", "section-word":"ds-panel-button ds-panel-rmark rmark word",
} as const;
function actionRecipe(intent: ButtonIntent, pressed: boolean, variant: "standard"|"landing"|"library"|"scan-go"|"scan-ok") {
  const landing = variant === "landing";
  const colors: Record<ButtonIntent,string> = variant === "scan-ok" ? {
    secondary:"tw:bg-transparent tw:text-ink-secondary tw:border-transparent tw:hover:border-ink-secondary",
    primary:"tw:bg-ink tw:text-surface-sunken tw:border-transparent tw:hover:bg-action-hover",
    danger:"tw:bg-danger tw:text-on-danger tw:border-transparent",
    quiet:"tw:bg-transparent tw:text-ink-secondary tw:border-transparent tw:hover:text-ink",
  } : variant === "library" ? {...buttonIntents,danger:"tw:bg-danger tw:text-surface-sunken tw:border-danger"} : buttonIntents;
  return [landing ? controlBehavior + " " + controlFocus.standard : controlBase,
    actionDisabled, "tw:leading-leading-body tw:border-(length:--ds-stroke-thin) tw:border-solid tw:whitespace-nowrap tw:cursor-pointer tw:items-center tw:justify-center tw:gap-small",
    landing ? "tw:block tw:min-h-control-height tw:rounded-card tw:px-action tw:py-flush tw:text-body-small tw:font-weight-label tw:font-control tw:mx-auto tw:mt-action tw:text-center" : "tw:inline-flex " + buttonShapes.standard,
    colors[intent], pressed ? "tw:shadow-emboss-pressed" : "",
    variant === "library" ? "tw:text-center" : variant === "scan-go" || variant === "scan-ok" ? "ds-panel-scan-button tw:flex-1 tw:text-center" + (variant === "scan-ok" ? " ds-panel-scan-quiet" : "") : "",
  ].join(" ");
}
function buttonRecipeStyles({
  variant = "standard",
  intent = "secondary",
  pressed = false,
  playing = false,
}: ButtonOptions = {}): string {
  if (variant === "scan-mark-go" || variant === "scan-mark-ok") return actionRecipe(intent,pressed,variant === "scan-mark-go" ? "scan-go" : "scan-ok");
  if (variant in panelButtons) return variant === "section-mark" || variant === "section-word" ? panelSectionMarkStyles(variant === "section-word") : panelButtonStyles[variant as keyof typeof panelButtonStyles];
  if (variant in playerButtonShapes) return playerControlRecipe(variant as PlayerControl) + (variant === "player-play" && playing ? " playing" : "");
  if (variant === "landing-create") return actionRecipe(intent,pressed,"landing");
  if (variant === "library-action") return actionRecipe(intent,pressed,"library");
  if (variant === "offline-update") return actionRecipe(intent,pressed,"standard") + " " + offlineUpdateRecipe();
  if (["ensemble-switch", "ensemble-other", "device-link", "account-delete-confirm", "landing-link", "landing-aside", "library-open", "landing-mode", "paper-choice", "sound-prompt"].includes(variant))
    return libraryControlRecipe(variant as LibraryControl);
  // D08/D10: retain account navigation and password reveal typography separately.
  if (variant === "account-link" || variant === "password-toggle")
    return [
      controlBase,
      "tw:disabled:opacity-(--ds-opacity-disabled-auth) tw:aria-disabled:opacity-(--ds-opacity-disabled-auth)",
      buttonShapes[variant as keyof typeof buttonShapes],
      "tw:border-0 tw:bg-transparent tw:text-ink-secondary tw:cursor-pointer",
      variant === "account-link"
        ? "tw:inline-block tw:leading-(--ds-leading-account-links) tw:hover:text-ink tw:hover:underline"
        : "tw:block tw:absolute tw:right-flush tw:bottom-inline tw:leading-leading-admin tw:normal-case tw:tracking-(--ds-tracking-default)",
    ].join(" ");
  if (variant in parityButtonShapes) {
    const shape = parityButtonShapes[variant as keyof typeof parityButtonShapes];
    return [controlBase, ["tile", "compact", "review-item", "hint", "domain-language"].includes(variant) ? actionDisabled : disabledRecipe, "tw:inline-flex tw:gap-small tw:cursor-pointer", variant === "review-item" ? "tw:border-solid" : "tw:items-center tw:justify-center " + (["tile","compact","hint"].includes(variant) ? "tw:border-(length:--ds-stroke-thin) tw:border-solid" : ""), shape,
      (variant === "transcription-language" || variant === "domain-language") ? pressed ? "tw:text-ink" : "tw:text-ink-secondary" : "",
      variant === "tile" && pressed ? "tw:border-transcription-accent tw:shadow-transcription-selected" : ""].join(" ");
  }
  const color =
    variant === "tour"
      ? intent === "secondary" || intent === "quiet"
        ? "tw:bg-transparent tw:text-surface-sunken tw:border-component-tour-rule"
        : "tw:bg-surface tw:text-ink tw:border-surface tw:hover:bg-surface-overlay"
      : variant === "dense-sort" ? "tw:bg-transparent tw:text-admin-accent tw:border-transparent" : variant === "dense"
        ? intent === "danger"
          ? "tw:bg-transparent tw:text-admin-danger tw:border-admin-danger"
          : "tw:bg-transparent tw:text-admin-ink tw:border-admin-rule"
        : buttonIntents[intent];
  return [
    variant.startsWith("dense") ? adminControlBase : controlBase,
    variant.startsWith("dense") ? denseDisabled : ["standard", "job-action", "pill", "tour"].includes(variant) ? actionDisabled : disabledRecipe,
    variant.startsWith("dense") ? "tw:leading-leading-admin tw:normal-nums" : "tw:leading-leading-body",
    (variant.startsWith("dense") ? (variant==="dense-sort"?"tw:inline-block ":"tw:inline-block tw:text-center ") : "tw:inline-flex tw:items-center tw:justify-center tw:gap-small ") + "tw:border-solid tw:whitespace-nowrap tw:cursor-pointer " + (variant === "dense-sort" ? "tw:border-0 tw:text-left" : "tw:border-(length:--ds-stroke-thin)"),
    buttonShapes[variant as keyof typeof buttonShapes],
    color,
    pressed ? "tw:shadow-emboss-pressed" : "",
  ].join(" ");
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
}
function iconButtonRecipeStyles({
  variant = "standard",
}: IconButtonOptions = {}) {
  if (variant === "section-add") return playerControlRecipe("section-add") + " tw:absolute tw:right-compact tw:top-1/2 tw:-translate-y-1/2 tw:bg-surface tw:max-panel:hidden!";
  if (variant === "player" || variant === "player-landscape" || variant === "player-zoom" || variant === "player-follow" || variant === "voice-more") return playerControlRecipe(variant);
  if (variant === "library-more") return libraryMoreRecipe();
  const shapes: Record<NonNullable<IconButtonOptions["variant"]>, string> = {
    "section-add":"", player:"", "player-landscape":"", "player-zoom":"", "player-follow":"", "voice-more":"",
    "library-more": "ds-library-song-more song-more tw:min-h-flush tw:size-toolbar tw:rounded-icon tw:p-flush tw:font-control tw:text-body tw:leading-leading-body tw:hover:bg-surface-overlay tw:hover:text-ink",
    "library-menu": "tw:min-h-flush tw:size-toolbar tw:rounded-icon tw:p-flush tw:font-control tw:text-body tw:leading-leading-body tw:text-ink-secondary tw:hover:bg-surface-overlay tw:hover:text-ink",
    standard:
      "tw:min-h-flush tw:size-toolbar tw:rounded-icon tw:p-flush tw:font-control tw:text-body tw:leading-leading-body tw:text-ink-secondary tw:hover:bg-surface-overlay tw:hover:text-ink",
    small:
      "tw:min-h-flush tw:size-panel tw:rounded-icon tw:p-flush tw:font-control tw:text-body tw:leading-leading-body tw:text-ink-secondary tw:hover:bg-surface-overlay tw:hover:text-ink",
    transcription:
      "tw:min-h-flush tw:size-toolbar tw:rounded-field tw:p-flush tw:font-close tw:font-weight-close-light tw:text-close tw:leading-leading-close tw:text-ink-secondary tw:hover:text-ink",
    "admin-close":
      "tw:min-h-touch tw:w-auto tw:h-auto tw:rounded-control-dense tw:px-control tw:py-compact tw:font-close tw:text-admin-close tw:leading-leading-admin tw:text-admin-ink",
    "admin-copy":
      "tw:min-h-panel tw:w-auto tw:h-auto tw:rounded-control-dense tw:p-compact tw:font-auth-mono tw:text-body-small tw:leading-leading-admin tw:text-admin-ink",
  };
  return [
    variant === "library-menu" ? unfocusedControlBase + " " + controlFocus.library : controlBase,
    variant.startsWith("admin") ? denseDisabled : disabledRecipe,
    (variant.startsWith("admin") ? "tw:inline-block tw:text-center " : "tw:inline-grid tw:place-items-center tw:flex-none ") + "tw:border-0 tw:bg-transparent tw:cursor-pointer",
    shapes[variant],
  ].join(" ");
}
/** ruled/transcription intentionally preserve identical looks pending D09/D10. */
export const fieldVariants = [
  "panel-tempo", "panel-measure", "panel-export", "panel-offset",
  "player-volume",
  "account-password",
  "library-prompt",
  "library-search",
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
): Record<'root'|'label'|'control'|'hint'|'error', string> {
  if (variant.startsWith("panel-")) {
    return {root:"ds-panel-part ds-panel-field-group tw:font-inherit tw:font-family-inherit tw:text-inherit tw:font-smoothing-inherit tw:locale-inherit tw:tap-highlight-inherit tw:select-text tw:grid",label:panelPartRecipe("label"),control:"ds-panel-input " + panelInputStyles[variant as keyof typeof panelInputStyles],hint:"tw:sr-only",error:"tw:sr-only"};
  }
  if (variant === "player-volume") return {root:playerControlRecipe("volume-root"),label:playerControlRecipe("volume-label"),control:playerControlRecipe("volume-input"),hint:"tw:sr-only",error:"tw:sr-only"};
  if (variant === "account-password") return accountFieldRecipe();
  if (variant === "library-search") return librarySearchRecipe();
  const admin = variant === "admin";
  const domain = variant === "domain" || variant === "domain-create";
  const prompt = variant === "library-prompt";
  const ruled = variant !== "boxed" && !prompt;
  return {
    root: variant === "domain-create" ? "tw:flex tw:flex-wrap tw:items-center tw:gap-(--ds-domain-label-gap) tw:min-w-flush" : variant === "ruled-account" ? "tw:block tw:mt-group tw:min-w-flush tw:font-auth-body " + (invalid ? "tw:mb-content" : "tw:mb-group") : admin ? "tw:grid tw:gap-snug tw:min-w-flush tw:font-auth-body tw:text-label tw:leading-leading-body tw:normal-case tw:tracking-(--ds-tracking-default) tw:tabular-nums" : "tw:grid tw:gap-snug tw:min-w-flush " + (variant === "ruled" || variant === "transcription" ? "tw:font-auth-body" : "tw:font-body"),
    label:
      variant === "domain-create" ? "tw:font-body tw:text-body tw:leading-leading-body tw:text-ink" : variant === "domain" ? "tw:font-auth-mono tw:text-caption tw:font-weight-medium tw:uppercase tw:tracking-(--ds-domain-label-tracking) tw:leading-leading-admin tw:text-ink-secondary" : ruled && !admin
        ? (variant === "ruled-account" ? "tw:block " : "") + "tw:font-auth-mono tw:text-caption tw:font-weight-medium tw:uppercase tw:tracking-tracking-auth-label tw:leading-leading-field tw:text-ink-secondary"
        : admin ? "tw:normal-nums tw:text-label tw:font-auth-body tw:leading-leading-body tw:text-admin-secondary" : "tw:text-label tw:font-body tw:leading-leading-body tw:text-ink-secondary",
    control: [
      admin ? adminControlBase : variant === "ruled" || variant === "transcription" ? unfocusedControlBase : prompt ? unfocusedControlBase + " tw:outline-none tw:outline-offset-(--ds-space-micro)" : controlBase,
      variant === "ruled" || variant === "transcription" ? "" : disabledRecipe,
      "tw:block tw:w-full tw:min-w-flush tw:font-weight-body tw:disabled:cursor-default" + (admin ? " tw:tabular-nums" : ""),
      kind === "textarea" && admin
        ? "tw:h-auto tw:min-h-control-textarea-height tw:resize-y tw:border-(length:--ds-stroke-thin) tw:border-solid tw:rounded-field tw:p-inline tw:font-auth-body tw:text-label tw:leading-leading-body tw:bg-admin-surface tw:text-admin-ink"
        : domain && kind === "select"
          ? "tw:rounded-field tw:border-0 tw:border-b-(length:--ds-stroke-thin) tw:border-solid tw:px-small tw:py-small tw:leading-leading-body tw:bg-transparent tw:text-ink tw:font-control tw:text-body"
          : ruled
            ? `tw:rounded-field tw:border-0 tw:border-b-(length:--ds-stroke-thin) tw:border-solid ${domain ? "tw:py-small tw:leading-leading-admin" : admin ? "tw:py-inline tw:leading-leading-body" : "tw:py-inline tw:leading-leading-field"} ${admin ? "tw:px-micro tw:bg-admin-surface tw:text-admin-ink tw:font-auth-body tw:text-label" : domain ? "tw:px-flush tw:bg-transparent tw:text-ink tw:font-auth-body tw:text-body" : "tw:px-flush tw:bg-transparent tw:text-ink tw:font-auth-body tw:text-input"}`
            : (kind === "textarea"
                ? "tw:h-auto tw:min-h-control-textarea-height tw:resize-y tw:p-inline"
                : "tw:h-control-height tw:px-control tw:py-flush") +
              " tw:rounded-card tw:border-(length:--ds-stroke-thin) tw:border-solid tw:bg-surface tw:text-ink tw:font-control tw:text-body tw:leading-leading-body",
      invalid && variant !== "ruled-account"
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
    error: variant === "ruled-account" ? "tw:block tw:mt-group tw:mb-content tw:text-body tw:font-auth-body tw:leading-leading-account tw:text-center tw:text-danger" : "tw:m-flush tw:text-label tw:font-body tw:leading-leading-body tw:text-danger",
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
export const checkboxVariants = ["standard", "permission", "export", "export-voice"] as const;
export interface CheckboxOptions {
  variant?: (typeof checkboxVariants)[number];
}
function checkboxRecipeStyles({ variant = "standard" }: CheckboxOptions = {}) {
  if (variant === "export-voice") return {root:"ds-panel-part tw:font-inherit tw:font-family-inherit tw:text-inherit tw:font-smoothing-inherit tw:locale-inherit tw:tap-highlight-inherit tw:select-text",control:"ds-panel-input ds-panel-export-check " + panelCheckboxStyles};
  return {
    root: "tw:inline-flex tw:items-center tw:gap-small tw:font-auth-body tw:text-label tw:leading-leading-body " + (variant === "permission" ? "tw:text-admin-ink" : "tw:text-ink"),
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
export const switchVariants = ["player", "player-preference", "admin", "capability", "comparison", "shared-device"] as const;
export interface SwitchOptions {
  variant?: (typeof switchVariants)[number];
  checked?: boolean;
}
function switchRecipeStyles({
  variant = "player",
  checked = false,
}: SwitchOptions = {}) {
  if (variant === "player-preference") return {label:"ds-player-switch-label",input:"tw:sr-only",root:playerControlRecipe("preference-switch"),thumb:"tw:hidden"};
  // D11: the offline policy retains its native checkbox, rather than a drawn track.
  if (variant === "shared-device") return sharedDeviceRecipe();
  const sizes = {
    player: "tw:w-switch tw:h-panel tw:p-compact",
    admin: "tw:w-page tw:h-sheet-dense tw:p-flush",
    capability: "tw:w-heading tw:h-content tw:p-micro",
    comparison: "tw:w-heading tw:h-content tw:p-micro",
  };
  const thumbs = {
    player: "tw:size-section",
    admin: "tw:size-action",
    capability: "tw:size-inline",
    comparison: "tw:size-inline",
  };
  return {
    label:
      (variant === "comparison" ? "tw:relative tw:flex" : "tw:relative tw:inline-flex") + " tw:items-center tw:gap-small tw:font-auth-body tw:text-small tw:text-ink-secondary tw:cursor-pointer" + (variant === "capability" ? " tw:min-h-panel tw:flex-nowrap tw:leading-leading-admin" : variant === "comparison" ? " tw:min-h-toolbar-dense tw:my-section tw:text-label" : ""),
    input: variant === "capability" || variant === "comparison" ? "tw:leading-leading-body tw:absolute tw:opacity-opacity-hidden tw:w-heading tw:h-section tw:m-flush tw:peer" : "tw:leading-leading-body tw:sr-only tw:peer",
    root:
      controlBase +
      " " +
      (variant === "admin" ? denseDisabled : disabledRecipe) +
      (variant === "admin" ? " tw:normal-nums tw:min-h-sheet-dense tw:font-auth-mono tw:text-body-small tw:leading-leading-admin tw:relative tw:inline-block tw:shrink-0 tw:rounded-pill tw:border-solid tw:cursor-pointer " :
      " tw:peer-focus-visible:outline-solid tw:peer-focus-visible:outline-(length:--ds-stroke-focus) tw:peer-focus-visible:[outline-color:var(--ds-focus)] tw:peer-focus-visible:outline-offset-(--ds-space-compact) tw:peer-disabled:opacity-(--ds-opacity-disabled) tw:min-h-flush tw:leading-leading-body tw:relative tw:inline-flex tw:items-center tw:shrink-0 tw:rounded-pill tw:border-solid tw:cursor-pointer ") +
      sizes[variant] +
      " " +
      (variant === "player"
        ? "tw:border-0 " + (checked ? "tw:bg-ink" : "tw:bg-surface-hover")
        : "tw:border-(length:--ds-stroke-thin) " +
          (checked
            ? variant === "admin"
              ? "tw:bg-admin-accent tw:border-admin-secondary"
              : "tw:bg-accent tw:border-accent"
            : "tw:bg-transparent tw:border-ink-secondary")),
    thumb:
      (variant === "admin" ? "tw:absolute tw:left-tight tw:top-tight " : "") + "tw:block tw:leading-leading-body tw:rounded-round tw:shrink-0 tw:transition-transform tw:duration-switch tw:motion-reduce:transition-none " +
      thumbs[variant] +
      " " +
      (checked
        ? "tw:bg-surface-sunken " +
          {
            player: "tw:translate-x-group",
            admin: "tw:translate-x-switch-admin-travel",
            capability: "tw:translate-x-control",
            comparison: "tw:translate-x-control",
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
