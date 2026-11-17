import { libraryDialogRecipe, libraryMenuRecipe } from "./library";
import { normalizeRecipe } from "./normalize";
import { controlBase, disabledRecipe, buttonRecipe } from "./controls";
/** dialog/confirm share appearance pending D14; confirm adds alertdialog semantics. */
export const dialogVariants = [
  "library-prompt", "library-sheet", "library-popover",
  "dialog",
  "sheet",
  "drawer",
  "confirm",
  "transcription",
  "domain-sheet", "transcription-review",
  "admin-confirm",
  "admin-reason",
] as const;
export type DialogVariant = (typeof dialogVariants)[number];
export interface DialogOptions {
  variant?: DialogVariant;
}
function dialogRecipeStyles({ variant = "dialog" }: DialogOptions = {}) {
  if (variant === "library-prompt" || variant === "library-sheet" || variant === "library-popover") return libraryDialogRecipe(variant);
  if(variant==='drawer'||variant==='admin-confirm'||variant==='admin-reason') {
    const drawer=variant==='drawer';
    return {
      panel: "tw:box-border tw:fixed tw:overflow-auto tw:outline-none tw:bg-admin-surface tw:text-admin-ink tw:font-auth-body tw:text-body tw:leading-leading-body tw:tabular-nums "+(drawer ? "tw:inset-y-0 tw:left-auto tw:right-none tw:m-none tw:h-full tw:w-width-drawer tw:max-w-full tw:max-h-none tw:border-0 tw:border-l tw:border-solid tw:border-admin-rule tw:p-heading tw:max-account:p-group tw:rounded-field tw:shadow-admin-detail tw:backdrop:bg-transparent" : "tw:inset-auto tw:left-1/2 tw:top-1/2 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:m-none tw:w-(--ds-workspace-confirm-width) "+(variant==='admin-confirm'?'tw:max-w-(--ds-dialog-native-max-width)':'tw:max-w-none')+" tw:max-h-(--ds-workspace-confirm-height) tw:border-(length:--ds-stroke-thin) tw:border-solid tw:border-admin-accent tw:p-heading tw:rounded-field tw:shadow-admin-confirm "+(variant==='admin-confirm'?'tw:backdrop:bg-backdrop':'tw:backdrop:bg-transparent')),
      content:"tw:block tw:font-auth-body tw:text-body tw:leading-leading-body tw:text-admin-ink tw:tabular-nums",
      header:'tw:block',
      title:drawer?"tw:block tw:tabular-nums tw:font-auth-display tw:text-workspace-heading tw:font-weight-medium tw:leading-leading-body tw:my-(--ds-workspace-heading-margin) tw:pr-toolbar":variant==='admin-reason'?'tw:sr-only':"tw:block tw:font-auth-mono tw:text-body-small tw:font-weight-body tw:leading-leading-admin tw:uppercase tw:tracking-(--ds-tracking-label) tw:my-row",
      body:"tw:block tw:my-content tw:font-auth-body tw:text-body tw:leading-leading-body tw:text-admin-ink",
      actions:'tw:block',
    };
  }
  if (variant === "domain-sheet") return {
    panel: "tw:fixed tw:inset-x-0 tw:bottom-none tw:m-none tw:w-full tw:max-w-none tw:max-h-(--ds-max-height-sheet) tw:overflow-auto tw:border-0 tw:border-t-(length:--ds-stroke-thin) tw:border-solid tw:border-rule-strong tw:rounded-t-sheet tw:p-(--ds-sheet-padding) ds-domain-sheet tw:surface-material-vellum-strong tw:[backdrop-filter:var(--ds-material-filter-strong)] ds-sheet-motion tw:motion-panel-sheet-transition tw:data-[sheet-state=entering]:[transform:var(--ds-panel-sheet-enter-transform)] tw:data-[sheet-state=closing]:[transform:var(--ds-panel-sheet-enter-transform)] tw:backdrop:opacity-visible tw:backdrop:motion-panel-backdrop-transition tw:data-[sheet-state=entering]:backdrop:opacity-hidden tw:data-[sheet-state=closing]:backdrop:opacity-hidden tw:motion-reduce:transition-none tw:motion-reduce:backdrop:transition-none tw:shadow-domain-sheet-shadow tw:text-ink tw:font-body tw:leading-leading-body tw:panel:inset-x-auto tw:panel:left-(--ds-left-sheet) tw:panel:bottom-section tw:panel:w-width-sheet tw:panel:rounded-dialog-roomy tw:panel:border-(length:--ds-stroke-thin) tw:backdrop:bg-domain-backdrop",
    content: "tw:block", header: "tw:relative tw:flex tw:items-center tw:justify-between tw:min-h-voice-row tw:pt-small",
    title: "tw:m-none tw:text-section tw:font-body tw:font-weight-strong tw:leading-leading-body", body: "tw:m-none tw:font-body tw:text-body tw:leading-leading-body", actions: "tw:flex tw:gap-inline",
  };
  if (variant === "transcription" || variant === "transcription-review") return {
    panel: "tw:box-border tw:border-(length:--ds-stroke-thin) tw:border-solid tw:outline-none tw:overflow-auto tw:text-ink tw:font-auth-body tw:leading-leading-body ds-transcription-panel tw:[background-image:var(--ds-material-fibre)] tw:border-rule-strong tw:backdrop:bg-transcription-backdrop tw:backdrop:backdrop-blur-(--ds-overlay-blur) " + (variant === "transcription-review" ? "tw:w-screen tw:h-dvh tw:max-w-none tw:max-h-none tw:m-none tw:border-0 tw:rounded-field tw:p-section tw:max-score:p-content tw:bg-surface" : "tw:absolute tw:inset-none tw:m-auto tw:h-fit tw:w-width-transcription tw:max-w-(--ds-dialog-native-max-width) tw:max-h-(--ds-max-height-dialog) tw:rounded-dialog-roomy tw:p-group tw:max-score:p-action tw:bg-surface-raised"),
    content: "tw:block tw:font-auth-body tw:leading-leading-body tw:text-ink", header: "tw:flex tw:items-center tw:justify-between tw:gap-group tw:mb-section tw:min-h-voice-row tw:font-auth-body", title: variant === "transcription-review" ? "tw:m-none tw:font-auth-display tw:font-weight-medium tw:text-transcription-title tw:max-score:text-transcription-title-phone tw:leading-leading-label" : "tw:m-none tw:font-auth-mono tw:font-weight-strong tw:text-section tw:leading-leading-transcription-heading", body: "tw:m-none tw:font-auth-body tw:text-body tw:leading-leading-body", actions: "tw:flex tw:gap-inline",
  };
  const shapes: Record<Exclude<DialogVariant,"library-prompt"|"library-sheet"|"library-popover"|"domain-sheet"|"transcription"|"transcription-review">, string> = {
    dialog:
      "tw:w-width-dialog tw:max-w-max-width-dialog tw:rounded-dialog tw:p-section tw:shadow-component-overlay-shadow",
    confirm:
      "tw:w-width-dialog tw:max-w-max-width-dialog tw:rounded-dialog tw:p-section tw:shadow-component-overlay-shadow",
    sheet:
      "ds-sheet-motion tw:motion-panel-sheet-transition tw:data-[sheet-state=entering]:[transform:var(--ds-panel-sheet-enter-transform)] tw:data-[sheet-state=closing]:[transform:var(--ds-panel-sheet-enter-transform)] tw:backdrop:opacity-visible tw:backdrop:motion-panel-backdrop-transition tw:data-[sheet-state=entering]:backdrop:opacity-hidden tw:data-[sheet-state=closing]:backdrop:opacity-hidden tw:motion-reduce:transition-none tw:motion-reduce:backdrop:transition-none tw:fixed tw:inset-x-0 tw:bottom-none tw:m-none tw:w-full tw:max-w-none tw:max-h-(--ds-max-height-sheet) tw:rounded-t-sheet tw:p-group tw:panel:inset-x-auto tw:panel:left-(--ds-left-sheet) tw:panel:bottom-section tw:panel:w-width-sheet tw:panel:rounded-dialog-roomy",
    drawer:
      "tw:fixed tw:inset-y-0 tw:right-none tw:m-none tw:h-full tw:w-width-drawer tw:max-w-full tw:rounded-field tw:p-heading tw:shadow-admin-detail",
    "admin-confirm": "",
    "admin-reason": "",
  };
  return {
    panel:
      "tw:box-border tw:border-(length:--ds-stroke-thin) tw:border-solid tw:outline-none tw:overflow-auto tw:overscroll-contain tw:bg-surface-raised tw:text-ink tw:border-rule-strong tw:leading-leading-body tw:backdrop:bg-backdrop tw:motion-reduce:transition-none " +
      "tw:font-body " +
      (variant === "sheet" ? "" : "tw:max-h-(--ds-max-height-dialog) ") +
      shapes[variant],
    content: "tw:grid tw:gap-row",
    header: "tw:flex tw:items-center tw:justify-between tw:gap-group",
    title:
      "tw:m-none tw:font-display tw:text-dialog tw:font-weight-medium tw:leading-leading-label tw:wrap-anywhere",
    body: "tw:m-none tw:text-ink-secondary tw:font-body tw:text-body tw:leading-leading-body",
    actions: "tw:flex tw:justify-end tw:gap-inline tw:mt-snug",
  };
}
export const sheetRecipe = () => dialogRecipe({ variant: "sheet" });
export const drawerRecipe = () => dialogRecipe({ variant: "drawer" });
export const confirmRecipe = () => dialogRecipe({ variant: "confirm" });
/** popover/sheet/member intentionally alias appearance pending D13; placement is separate. */
export const menuVariants = ["library", "popover", "sheet", "member", "job", "admin"] as const;
export interface MenuOptions {
  variant?: (typeof menuVariants)[number];
}
function menuRecipeStyles({ variant = "popover" }: MenuOptions = {}) {
  if (variant === "library") return libraryMenuRecipe();
  if (variant === "member" || variant === "job") return {
    root: "tw:absolute tw:right-none tw:grid tw:box-border tw:border-(length:--ds-stroke-thin) tw:border-solid tw:border-rule-strong tw:bg-surface-raised tw:text-ink tw:shadow-menu " + (variant === "member" ? "tw:top-full tw:z-stage tw:min-w-menu-member-width tw:p-none tw:gap-none" : "tw:z-transcription tw:min-w-menu-job-width tw:p-control tw:gap-small tw:rounded-menu"),
    item: variant === "member" ? controlBase + " " + disabledRecipe + " ds-menu-item tw:flex tw:items-center tw:gap-control tw:min-h-touch tw:px-control tw:py-none tw:rounded-control tw:border-0 tw:bg-transparent tw:font-body tw:font-weight-label tw:text-button tw:text-left tw:text-ink tw:cursor-pointer" : "ds-job-menu-item " + buttonRecipe().replace("tw:font-control", "tw:font-auth-body"),
    danger: "tw:text-danger!", check: "tw:ml-auto tw:text-component-menu-check",
  };
  return {
    root: "tw:grid tw:gap-none tw:box-border tw:p-small tw:rounded-tile tw:border-(length:--ds-stroke-thin) tw:border-solid tw:border-rule-strong tw:bg-surface-raised tw:text-ink tw:font-body tw:shadow-menu",
    item:
      controlBase +
      " " +
      disabledRecipe +
      " ds-menu-item tw:flex tw:items-center tw:gap-control tw:min-h-touch tw:px-control tw:py-none tw:rounded-control tw:border-0 tw:bg-transparent tw:font-weight-label tw:text-button tw:text-left tw:cursor-pointer " +
      (variant === "admin" ? "tw:font-auth-mono" : ""),
    danger: "tw:text-danger!",
    check: "tw:ml-auto tw:text-component-menu-check",
  };
}
export const toastVariants = ["info", "error"] as const;
export interface ToastOptions {
  kind?: (typeof toastVariants)[number];
  font?: "body" | "auth";
}
function toastRecipeStyles({
  kind = "info",
  font = "body",
}: ToastOptions = {}) {
  return (
    "tw:box-border tw:m-none tw:border-0 tw:px-content tw:py-control tw:rounded-card tw:text-toast tw:font-weight-label tw:leading-leading-body tw:shadow-component-toast-shadow " +
    (font === "auth" ? "tw:font-auth-body " : "tw:font-body ") +
    (kind === "error"
      ? "tw:bg-danger tw:text-surface-sunken"
      : "tw:bg-ink tw:text-surface-sunken")
  );
}
/** Body host geometry is separate from the static notification appearance. */
export function toastPlacementRecipe() {
  return "ds-toast-placement tw:fixed tw:z-toast tw:pointer-events-none tw:inset-auto tw:left-1/2 tw:bottom-toast-bottom tw:max-w-toast-max-width tw:[transform:var(--ds-panel-toast-enter-transform)] tw:opacity-hidden tw:motion-panel-toast-transition tw:[&.show]:opacity-visible tw:[&.show]:[transform:var(--ds-panel-toast-shown-transform)] tw:max-panel:bottom-toast-bottom-phone tw:[body:has(.domain-sheet)_&]:top-content tw:[body:has(.domain-sheet)_&]:bottom-auto tw:[body:has(.domain-sheet)_&]:max-w-toast-max-width-sheet";
}

export function dialogRecipe(
  ...args: Parameters<typeof dialogRecipeStyles>
): ReturnType<typeof dialogRecipeStyles> {
  return normalizeRecipe(dialogRecipeStyles(...args));
}
export function menuRecipe(
  ...args: Parameters<typeof menuRecipeStyles>
): ReturnType<typeof menuRecipeStyles> {
  const slots = menuRecipeStyles(...args);
  return normalizeRecipe({ ...slots, item: slots.item + " tw:relative tw:isolate tw:hover:text-component-menu-hover tw:focus-visible:text-component-menu-hover tw:hover:[text-shadow:var(--ds-component-menu-shadow)] tw:focus-visible:[text-shadow:var(--ds-component-menu-shadow)] tw:hover:before:opacity-visible tw:focus-visible:before:opacity-visible" });
}
export function toastRecipe(
  ...args: Parameters<typeof toastRecipeStyles>
): ReturnType<typeof toastRecipeStyles> {
  return normalizeRecipe(toastRecipeStyles(...args));
}
