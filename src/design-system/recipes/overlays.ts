import { normalizeRecipe } from "./normalize";
import { controlBase, disabledRecipe, buttonRecipe } from "./controls";

/** D12: centered dialogs; only score review occupies the full screen. */
export const dialogVariants = [
  "library-prompt", "library-sheet", "library-popover",
  "dialog",
  "sheet",
  "drawer", "admin-detail",
  "confirm",
  "transcription",
  "domain-sheet", "transcription-review",
  "admin-confirm",
  "admin-reason",
] as const;
export type DialogVariant = (typeof dialogVariants)[number];
export interface DialogOptions {
  variant?: DialogVariant;
  destructive?: boolean;
}
/** D13: compact row menus remain anchored at every viewport width. */
export const menuVariants = ["library", "popover", "sheet", "member", "job", "admin"] as const;
export interface MenuOptions {
  variant?: (typeof menuVariants)[number];
}
export const toastVariants = ["info", "error"] as const;
export interface ToastOptions {
  kind?: (typeof toastVariants)[number];
  font?: "body" | "auth";
}
function missingArea(name:string):never { throw Error("Use app recipes for " + name); }
export function createOverlayRecipes(extensions: {
 dialog?:(variant:'library-prompt'|'library-sheet'|'library-popover')=>Record<'panel'|'content'|'header'|'title'|'body'|'actions',string>;
 menu?:()=>{root:string;item:string;danger:string;check:string;option?:string;value?:string;chevron?:string;sub?:string};
} = {}) {

const centeredPanel = "tw:fixed tw:inset-flush tw:m-auto tw:h-fit tw:box-border tw:overflow-auto tw:overscroll-contain tw:outline-none tw:w-width-dialog tw:max-w-max-width-dialog tw:max-h-max-height-dialog tw:border-(length:--ds-stroke-thin) tw:border-solid tw:border-rule-strong tw:rounded-dialog tw:p-section tw:bg-surface-raised tw:text-ink tw:font-body tw:leading-leading-body tw:shadow-component-overlay-shadow tw:backdrop:bg-backdrop tw:motion-library-prompt-transition tw:data-[panel-state=entering]:opacity-opacity-hidden tw:data-[panel-state=closing]:opacity-opacity-hidden tw:motion-reduce:transition-none";
function dialogRecipeStyles({ variant = "dialog", destructive = false }: DialogOptions = {}) {
  if (variant === "library-prompt" || variant === "library-sheet" || variant === "library-popover") return extensions.dialog?.(variant) ?? missingArea("library dialog");
  const admin = variant === "drawer" || variant === "admin-detail" || variant === "admin-confirm" || variant === "admin-reason";
  const review = variant === "transcription-review";
  return {
    panel: (review
      ? "tw:fixed tw:inset-flush tw:box-border tw:w-screen tw:h-dvh tw:max-w-none tw:max-h-none tw:m-flush tw:border-0 tw:rounded-field tw:p-section tw:max-score:p-content tw:bg-surface tw:text-ink tw:font-body tw:overflow-auto tw:outline-none tw:backdrop:bg-backdrop"
      : centeredPanel + (variant === "domain-sheet" || variant === "sheet" || admin ? " tw:w-width-sheet" : variant === "transcription" ? " tw:w-width-transcription" : "")) + (admin ? " tw:tabular-nums" : "") + (destructive ? " tw:border-danger" : ""),
    content: "tw:grid tw:gap-row tw:min-w-flush",
    header: "tw:flex tw:items-center tw:justify-between tw:gap-group",
    title: "tw:m-flush tw:font-body tw:text-dialog tw:font-weight-strong tw:leading-leading-label tw:wrap-anywhere",
    body: "tw:m-flush tw:text-ink-secondary tw:font-body tw:text-body tw:leading-leading-body",
    actions: "tw:flex tw:flex-wrap tw:justify-end tw:gap-inline tw:mt-snug",
  };
}
const sheetRecipe = () => dialogRecipe({ variant: "sheet" });
const drawerRecipe = () => dialogRecipe({ variant: "drawer" });
const confirmRecipe = () => dialogRecipe({ variant: "confirm" });
function menuRecipeStyles({ variant = "popover" }: MenuOptions = {}) {
  if (variant === "library") return extensions.menu?.() ?? missingArea("library menu");
  if (variant === "member" || variant === "job") return {
    root: "tw:fixed tw:inset-auto tw:m-flush tw:overflow-auto tw:overscroll-contain tw:wrap-anywhere tw:grid tw:box-border tw:border-(length:--ds-stroke-thin) tw:border-solid tw:border-rule-strong tw:bg-surface-raised tw:text-ink tw:shadow-menu " + (variant === "member" ? "tw:z-menu tw:min-w-menu-member-width tw:p-flush tw:gap-flush" : "tw:z-transcription tw:min-w-menu-job-width tw:p-control tw:gap-small tw:rounded-menu"),
    item: variant === "member" ? controlBase + " " + disabledRecipe + " ds-menu-item tw:flex tw:items-center tw:gap-control tw:min-h-touch tw:px-control tw:py-flush tw:rounded-control tw:border-0 tw:bg-transparent tw:font-body tw:font-weight-label tw:text-button tw:text-left tw:text-ink tw:cursor-pointer" : "ds-job-menu-item " + buttonRecipe(),
    danger: "tw:text-danger!", check: "tw:ml-auto tw:text-component-menu-check",
  };
  return {
    root: "tw:grid tw:gap-flush tw:box-border tw:p-small tw:rounded-tile tw:border-(length:--ds-stroke-thin) tw:border-solid tw:border-rule-strong tw:bg-surface-raised tw:text-ink tw:font-body tw:shadow-menu",
    item:
      controlBase +
      " " +
      disabledRecipe +
      " ds-menu-item tw:flex tw:items-center tw:gap-control tw:min-h-touch tw:px-control tw:py-flush tw:rounded-control tw:border-0 tw:bg-transparent tw:font-weight-label tw:text-button tw:text-left tw:cursor-pointer " +
      (variant === "admin" ? "tw:font-auth-mono" : ""),
    danger: "tw:text-danger!",
    check: "tw:ml-auto tw:text-component-menu-check",
  };
}
function toastRecipeStyles({
  kind = "info",
  font = "body",
}: ToastOptions = {}) {
  return (
    "tw:box-border tw:m-flush tw:border-0 tw:px-content tw:py-control tw:rounded-card tw:text-toast tw:font-weight-label tw:leading-leading-body tw:shadow-component-toast-shadow " +
    (font === "auth" ? "tw:font-auth-body " : "tw:font-body ") +
    (kind === "error"
      ? "tw:bg-danger tw:text-surface-sunken"
      : "tw:bg-ink tw:text-surface-sunken")
  );
}
/** Body host geometry is separate from the static notification appearance. */
function toastPlacementRecipe() {
  return "ds-toast-placement tw:fixed tw:z-toast tw:pointer-events-auto tw:inset-auto tw:left-1/2 tw:bottom-toast-bottom tw:max-w-toast-max-width tw:[transform:var(--ds-panel-toast-enter-transform)] tw:opacity-opacity-hidden tw:motion-panel-toast-transition tw:[&.show]:opacity-opacity-visible tw:[&.show]:[transform:var(--ds-panel-toast-shown-transform)] tw:flex tw:items-center tw:gap-control tw:wrap-anywhere";
}

function dialogRecipe(
  ...args: Parameters<typeof dialogRecipeStyles>
): ReturnType<typeof dialogRecipeStyles> {
  return normalizeRecipe(dialogRecipeStyles(...args));
}
function menuRecipe(
  ...args: Parameters<typeof menuRecipeStyles>
): ReturnType<typeof menuRecipeStyles> {
  const slots = menuRecipeStyles(...args);
  return normalizeRecipe({ ...slots, item: slots.item + " tw:relative tw:isolate tw:hover:text-component-menu-hover tw:focus-visible:text-component-menu-hover tw:hover:[text-shadow:var(--ds-component-menu-shadow)] tw:focus-visible:[text-shadow:var(--ds-component-menu-shadow)] tw:hover:before:opacity-opacity-visible tw:focus-visible:before:opacity-opacity-visible" });
}
function toastRecipe(
  ...args: Parameters<typeof toastRecipeStyles>
): ReturnType<typeof toastRecipeStyles> {
  return normalizeRecipe(toastRecipeStyles(...args));
}
return { sheetRecipe, drawerRecipe, confirmRecipe, toastPlacementRecipe, dialogRecipe, menuRecipe, toastRecipe };
}
export const { sheetRecipe, drawerRecipe, confirmRecipe, toastPlacementRecipe, dialogRecipe, menuRecipe, toastRecipe } = /* @__PURE__ */ createOverlayRecipes();
