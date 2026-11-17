import { createControlRecipes, actionRecipe } from "./controls";
import { libraryControlRecipe, libraryMoreRecipe, librarySearchRecipe, offlineUpdateRecipe, type LibraryControl } from "./library";
import { accountFieldRecipe } from "./account";
import { panelButtonStyles, panelSectionMarkStyles, panelInputStyles, panelCheckboxStyles, panelPartRecipe } from "./panels";
import { playerControlRecipe, type PlayerControl } from "./player";
const playerButtonShapes = {"player-back": "ds-player-button ds-player-back-btn back-btn", "player-mode": "ds-player-button ds-player-badge badge", "player-info": "ds-player-button ds-player-info-row info-row", "player-position": "ds-player-button ds-player-pos pos", "player-transport": "ds-player-button ds-player-t-btn t-btn", "player-stop-left": "ds-player-button ds-player-t-btn ds-player-t-stop-left t-btn t-stop-left", "player-stop-mid": "ds-player-button ds-player-t-btn ds-player-t-stop-mid t-btn t-stop-mid", "player-play": "ds-player-button ds-player-play-btn play-btn", "player-toggle": "ds-player-button ds-player-t-btn ds-player-toggle t-btn toggle", "player-preference": "ds-player-button ds-player-t-btn ds-player-toggle ds-player-t-metro t-btn toggle t-metro", "player-save": "ds-player-button ds-player-t-btn ds-player-t-save t-btn t-save", "player-voice-name": "ds-player-button ds-player-voice-name voice-name", "player-voice-name-long": "ds-player-button ds-player-voice-name ds-player-long voice-name long", "player-mute": "ds-player-button ds-player-mix-btn ds-player-mute-btn mix-btn mute-btn", "player-solo": "ds-player-button ds-player-mix-btn ds-player-solo-btn mix-btn solo-btn", "player-chip": "ds-player-button ds-player-chip chip", "player-mixer-chip": "ds-player-button ds-player-chip ds-player-mixer-chip chip mixer-chip", "player-segmented": "ds-player-button ds-player-seg-item seg-item", "player-reset": "ds-player-button ds-player-reset player-reset"} as const;
const panelButtons = {
 "panel-step":"ds-panel-button", "panel-tempo":"ds-panel-button ds-panel-stepper-value stepper-value", "panel-round":"ds-panel-button ds-panel-round-btn round-btn", "panel-preset":"ds-panel-button ds-panel-bpm-preset bpm-preset", "section-mark":"ds-panel-button ds-panel-rmark rmark", "section-word":"ds-panel-button ds-panel-rmark rmark word",
} as const;

/** Area composition depends on base controls; auth never imports this module. */
const composed = /* @__PURE__ */ createControlRecipes({
 button({variant = "standard", intent = "secondary", pressed = false, playing = false}) {
  if (variant === "scan-mark-go" || variant === "scan-mark-ok") return actionRecipe(intent,pressed,variant === "scan-mark-go" ? "scan-go" : "scan-ok");
  if (variant in panelButtons) return variant === "section-mark" || variant === "section-word" ? panelSectionMarkStyles(variant === "section-word") : panelButtonStyles[variant as keyof typeof panelButtonStyles];
  if (variant in playerButtonShapes) return playerControlRecipe(variant as PlayerControl) + (variant === "player-play" && playing ? " playing" : "");
  if (variant === "landing-create") return actionRecipe(intent,pressed,"landing");
  if (variant === "library-action") return actionRecipe(intent,pressed,"library");
  if (variant === "offline-update") return actionRecipe(intent,pressed,"standard") + " " + offlineUpdateRecipe();
  if (["ensemble-switch", "ensemble-other", "device-link", "account-delete-confirm", "landing-link", "landing-aside", "library-open", "landing-mode", "paper-choice", "sound-prompt"].includes(variant))
    return libraryControlRecipe(variant as LibraryControl);
  return undefined;
 },
 iconButton({variant = "standard"}) {
  if (variant === "section-add") return playerControlRecipe("section-add") + " tw:absolute tw:right-compact tw:top-1/2 tw:-translate-y-1/2 tw:bg-surface tw:max-panel:hidden!";
  if (variant === "player" || variant === "player-landscape" || variant === "player-zoom" || variant === "player-follow" || variant === "voice-more") return playerControlRecipe(variant);
  if (variant === "library-more") return libraryMoreRecipe();
  return undefined;
 },
 field({variant = "ruled", invalid = false}, kind) {
  if (variant.startsWith("panel-")) {
    return {root:"ds-panel-part ds-panel-field-group tw:font-inherit tw:font-family-inherit tw:text-inherit tw:font-smoothing-inherit tw:locale-inherit tw:tap-highlight-inherit tw:select-text tw:grid",label:panelPartRecipe("label"),control:"ds-panel-input " + panelInputStyles[variant as keyof typeof panelInputStyles],hint:"tw:sr-only",error:"tw:sr-only"};
  }
  if (variant === "player-volume") return {root:playerControlRecipe("volume-root"),label:playerControlRecipe("volume-label"),control:playerControlRecipe("volume-input"),hint:"tw:sr-only",error:"tw:sr-only"};
  if (variant === "account-password") return accountFieldRecipe();
  if (variant === "library-search") return librarySearchRecipe();
  return undefined;
 },
 checkbox({variant = "standard"}) {
  if (variant === "export-voice") return {root:"ds-panel-part tw:touch:min-h-control-target-touch tw:touch:min-w-control-target-touch tw:inline-flex tw:items-center tw:font-inherit tw:font-family-inherit tw:text-inherit tw:font-smoothing-inherit tw:locale-inherit tw:tap-highlight-inherit tw:select-text",control:"ds-panel-input ds-panel-export-check " + panelCheckboxStyles};
  return undefined;
 },
 switch({variant = "player", checked = false}) {
  if (variant === "player-preference") return {label:"ds-player-switch-label",input:"tw:sr-only",root:playerControlRecipe("preference-switch"),thumb:"tw:hidden"};
  // D11: the immediately applied shared-device preference uses the ordinary switch.
  return undefined;
 },
});
export { createControlRecipes, buttonVariants, buttonSizes, iconButtonVariants, fieldVariants, checkboxVariants, switchVariants, controlBase, disabledRecipe, actionRecipe, controlGroupRecipe } from "./controls";
export type { ButtonOptions, ButtonVariant, ButtonIntent, ControlDensity, IconButtonOptions, FieldOptions, FieldVariant, CheckboxOptions, SwitchOptions } from "./controls";
export const { buttonRecipe, iconButtonRecipe, fieldRecipe, inputRecipe, selectRecipe, textareaRecipe, checkboxRecipe, switchRecipe } = composed;
