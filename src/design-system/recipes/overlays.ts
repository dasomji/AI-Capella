import { normalizeRecipe } from "./normalize";
import { controlBase, disabledRecipe, buttonRecipe } from "./controls";
/** dialog/confirm share appearance pending D14; confirm adds alertdialog semantics. */
export const dialogVariants = [
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
  if(variant==='drawer'||variant==='admin-confirm'||variant==='admin-reason') {
    const drawer=variant==='drawer';
    return {
      panel: 'tw:box-border tw:fixed tw:overflow-auto tw:outline-none tw:bg-admin-surface tw:text-admin-ink tw:font-auth-body tw:text-body tw:leading-body tw:tabular-nums '+(drawer ? 'tw:inset-y-0 tw:left-auto tw:right-0 tw:m-0 tw:h-full tw:w-drawer tw:max-w-full tw:max-h-none tw:border-0 tw:border-l tw:border-solid tw:border-admin-rule tw:p-28 tw:max-account:p-20 tw:rounded-field tw:shadow-admin-detail tw:backdrop:bg-transparent' : 'tw:inset-auto tw:left-1/2 tw:top-1/2 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:m-0 tw:w-(--ds-workspace-confirm-width) '+(variant==='admin-confirm'?'tw:max-w-(--ds-dialog-native-max-width)':'tw:max-w-none')+' tw:max-h-(--ds-workspace-confirm-height) tw:border tw:border-solid tw:border-admin-accent tw:p-28 tw:rounded-field tw:shadow-admin-confirm '+(variant==='admin-confirm'?'tw:backdrop:bg-backdrop':'tw:backdrop:bg-transparent')),
      content:'tw:block tw:font-auth-body tw:text-body tw:leading-body tw:text-admin-ink tw:tabular-nums',
      header:'tw:block',
      title:drawer?'tw:block tw:tabular-nums tw:font-auth-display tw:text-workspace-heading tw:font-emphasis tw:leading-body tw:my-(--ds-workspace-heading-margin) tw:pr-40':variant==='admin-reason'?'tw:sr-only':'tw:block tw:font-auth-mono tw:text-body-small tw:font-regular tw:leading-admin tw:uppercase tw:tracking-(--ds-tracking-label) tw:my-14',
      body:'tw:block tw:my-16 tw:font-auth-body tw:text-body tw:leading-body tw:text-admin-ink',
      actions:'tw:block',
    };
  }
  if (variant === "domain-sheet") return {
    panel: "tw:fixed tw:inset-x-0 tw:bottom-0 tw:m-0 tw:w-full tw:max-w-none tw:max-h-(--ds-max-height-sheet) tw:overflow-auto tw:border-0 tw:border-t tw:border-solid tw:border-rule-strong tw:rounded-t-sheet tw:p-(--ds-sheet-padding) ds-domain-sheet ds-sheet-motion tw:shadow-domain-sheet tw:text-ink tw:font-body tw:leading-body tw:panel:inset-x-auto tw:panel:left-(--ds-left-sheet) tw:panel:bottom-24 tw:panel:w-sheet tw:panel:rounded-transcription-dialog tw:panel:border tw:backdrop:bg-domain-backdrop",
    content: "tw:block", header: "tw:relative tw:flex tw:items-center tw:justify-between tw:min-h-50 tw:pt-8",
    title: "tw:m-0 tw:text-section tw:font-body tw:font-strong tw:leading-body", body: "tw:m-0 tw:font-body tw:text-body tw:leading-body", actions: "tw:flex tw:gap-10",
  };
  if (variant === "transcription" || variant === "transcription-review") return {
    panel: "tw:box-border tw:border tw:border-solid tw:outline-none tw:overflow-auto tw:text-ink tw:font-auth-body tw:leading-body ds-transcription-panel tw:border-rule-strong tw:backdrop:bg-transcription-backdrop tw:backdrop:backdrop-blur-(--ds-overlay-blur) " + (variant === "transcription-review" ? "tw:w-screen tw:h-dvh tw:max-w-none tw:max-h-none tw:m-0 tw:border-0 tw:rounded-field tw:p-24 tw:max-score:p-16 tw:bg-surface" : "tw:absolute tw:inset-0 tw:m-auto tw:h-fit tw:w-transcription tw:max-w-(--ds-dialog-native-max-width) tw:max-h-(--ds-max-height-dialog) tw:rounded-transcription-dialog tw:p-20 tw:max-score:p-18 tw:bg-surface-raised"),
    content: "tw:block tw:font-auth-body tw:leading-body tw:text-ink", header: "tw:flex tw:items-center tw:justify-between tw:gap-20 tw:mb-24 tw:min-h-50 tw:font-auth-body", title: variant === "transcription-review" ? "tw:m-0 tw:font-auth-display tw:font-emphasis tw:text-transcription-title tw:max-score:text-transcription-title-phone tw:leading-label" : "tw:m-0 tw:font-auth-mono tw:font-strong tw:text-section tw:leading-transcription-heading", body: "tw:m-0 tw:font-auth-body tw:text-body tw:leading-body", actions: "tw:flex tw:gap-10",
  };
  const shapes: Record<Exclude<DialogVariant,"domain-sheet"|"transcription"|"transcription-review">, string> = {
    dialog:
      "tw:w-dialog tw:max-w-dialog tw:rounded-dialog tw:p-24 tw:shadow-component-overlay",
    confirm:
      "tw:w-dialog tw:max-w-dialog tw:rounded-dialog tw:p-24 tw:shadow-component-overlay",
    sheet:
      "ds-sheet-motion tw:fixed tw:inset-x-0 tw:bottom-0 tw:m-0 tw:w-full tw:max-w-none tw:max-h-(--ds-max-height-sheet) tw:rounded-t-sheet tw:p-20 tw:panel:inset-x-auto tw:panel:left-(--ds-left-sheet) tw:panel:bottom-24 tw:panel:w-sheet tw:panel:rounded-transcription-dialog",
    drawer:
      "tw:fixed tw:inset-y-0 tw:right-0 tw:m-0 tw:h-full tw:w-drawer tw:max-w-full tw:rounded-field tw:p-28 tw:shadow-admin-detail",
    "admin-confirm": "",
    "admin-reason": "",
  };
  return {
    panel:
      "tw:box-border tw:border tw:border-solid tw:outline-none tw:overflow-auto tw:overscroll-contain tw:bg-surface-raised tw:text-ink tw:border-rule-strong tw:leading-body tw:backdrop:bg-backdrop tw:motion-reduce:transition-none " +
      "tw:font-body " +
      (variant === "sheet" ? "" : "tw:max-h-(--ds-max-height-dialog) ") +
      shapes[variant],
    content: "tw:grid tw:gap-14",
    header: "tw:flex tw:items-center tw:justify-between tw:gap-20",
    title:
      "tw:m-0 tw:font-display tw:text-dialog tw:font-emphasis tw:leading-label tw:wrap-anywhere",
    body: "tw:m-0 tw:text-ink-secondary tw:font-body tw:text-body tw:leading-body",
    actions: "tw:flex tw:justify-end tw:gap-10 tw:mt-6",
  };
}
export const sheetRecipe = () => dialogRecipe({ variant: "sheet" });
export const drawerRecipe = () => dialogRecipe({ variant: "drawer" });
export const confirmRecipe = () => dialogRecipe({ variant: "confirm" });
/** popover/sheet/member intentionally alias appearance pending D13; placement is separate. */
export const menuVariants = ["popover", "sheet", "member", "job", "admin"] as const;
export interface MenuOptions {
  variant?: (typeof menuVariants)[number];
}
function menuRecipeStyles({ variant = "popover" }: MenuOptions = {}) {
  if (variant === "member" || variant === "job") return {
    root: "tw:absolute tw:right-0 tw:grid tw:box-border tw:border tw:border-solid tw:border-rule-strong tw:bg-surface-raised tw:text-ink tw:shadow-menu " + (variant === "member" ? "tw:top-full tw:z-stage tw:min-w-menu-member tw:p-0 tw:gap-0" : "tw:z-transcription tw:min-w-menu-job tw:p-12 tw:gap-8 tw:rounded-menu"),
    item: variant === "member" ? controlBase + " " + disabledRecipe + " ds-menu-item tw:flex tw:items-center tw:gap-12 tw:min-h-44 tw:px-12 tw:py-0 tw:rounded-control tw:border-0 tw:bg-transparent tw:font-body tw:font-label tw:text-button tw:text-left tw:text-ink tw:cursor-pointer" : "ds-job-menu-item " + buttonRecipe().replace("tw:font-control", "tw:font-auth-body"),
    danger: "tw:text-danger!", check: "tw:ml-auto tw:text-menu-check",
  };
  return {
    root: "tw:grid tw:gap-0 tw:box-border tw:p-8 tw:rounded-transcription-tile tw:border tw:border-solid tw:border-rule-strong tw:bg-surface-raised tw:text-ink tw:font-body tw:shadow-menu",
    item:
      controlBase +
      " " +
      disabledRecipe +
      " ds-menu-item tw:flex tw:items-center tw:gap-12 tw:min-h-44 tw:px-12 tw:py-0 tw:rounded-control tw:border-0 tw:bg-transparent tw:font-label tw:text-button tw:text-left tw:cursor-pointer " +
      (variant === "admin" ? "tw:font-auth-mono" : ""),
    danger: "tw:text-danger!",
    check: "tw:ml-auto tw:text-menu-check",
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
    "tw:box-border tw:m-0 tw:border-0 tw:px-16 tw:py-12 tw:rounded-card tw:text-toast tw:font-label tw:leading-body tw:shadow-component-toast " +
    (font === "auth" ? "tw:font-auth-body " : "tw:font-body ") +
    (kind === "error"
      ? "tw:bg-danger tw:text-surface-sunken"
      : "tw:bg-ink tw:text-surface-sunken")
  );
}
/** Body host geometry is separate from the static notification appearance. */
export function toastPlacementRecipe() {
  return "ds-toast-placement tw:fixed tw:z-toast tw:pointer-events-none";
}

export function dialogRecipe(
  ...args: Parameters<typeof dialogRecipeStyles>
): ReturnType<typeof dialogRecipeStyles> {
  return normalizeRecipe(dialogRecipeStyles(...args));
}
export function menuRecipe(
  ...args: Parameters<typeof menuRecipeStyles>
): ReturnType<typeof menuRecipeStyles> {
  return normalizeRecipe(menuRecipeStyles(...args));
}
export function toastRecipe(
  ...args: Parameters<typeof toastRecipeStyles>
): ReturnType<typeof toastRecipeStyles> {
  return normalizeRecipe(toastRecipeStyles(...args));
}
