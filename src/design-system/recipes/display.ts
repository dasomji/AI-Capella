import { normalizeRecipe } from "./normalize";
import { buttonRecipe, type ButtonOptions, type ControlDensity } from "./controls";

export const cardVariants = [
  "library",
  "surface",
  "raised",
  "material",
  "admin",
  "tour",
  "power-hint",
] as const;
export interface CardOptions {
  variant?: (typeof cardVariants)[number];
}
export const feedbackIntents = [
  "neutral",
  "success",
  "warning",
  "error",
  "accent",
] as const;
export type FeedbackIntent = (typeof feedbackIntents)[number];
export interface FeedbackOptions {
  variant?: "standard" | "admin" | "account" | "library" | "account-delete" | "offline-prepared";
  intent?: FeedbackIntent;
}
/** admin/presets share unselected items pending D10; admin selected is underlined. */
export const toggleGroupVariants = [
  "segmented",
  "language",
  "transcription",
  "admin",
  "admin-language",
  "presets",
] as const;
export interface ToggleGroupOptions {
  /** Optional inline separator preserves text choices without a flex gap. */
  separator?: string;
  variant?: (typeof toggleGroupVariants)[number];
}
export const emptyStateVariants = [
  "standard",
  "compact",
  "jobs-hidden",
] as const;
export interface EmptyStateOptions {
  variant?: (typeof emptyStateVariants)[number];
}
/** D16 A: records adapt to labelled cards on phones; scroll and metrics keep contained columns. */
export const tableVariants = ["records", "scroll", "metrics"] as const;
export interface TableOptions {
  bounded?: boolean;
  mono?: boolean;
  variant?: (typeof tableVariants)[number];
}
/** Shared appearances; screen-owned data/selection/sorting stay outside recipes. */
export type ToggleItemOptions = ButtonOptions;
function missingArea(name:string):never { throw Error("Use app recipes for " + name); }
export function createDisplayRecipes(extensions: {card?:()=>string; badge?:(kind:'prepared'|'tag')=>string; accountError?:()=>string} = {}) {

function cardRecipeStyles({ variant = "surface" }: CardOptions = {}) {
  if (variant === "library") return extensions.card?.() ?? missingArea("library card");
  if (variant === "tour" || variant === "power-hint") return "tw:box-border tw:m-flush tw:border-(length:--ds-stroke-thin) tw:border-solid tw:border-rule-strong tw:bg-surface tw:text-ink tw:font-control tw:leading-leading-body " + (variant === "tour" ? "ds-tour-note tw:absolute tw:left-flush tw:top-flush tw:w-tour-note-width tw:opacity-opacity-hidden tw:motion-panel-tour-transition tw:[&.shown]:opacity-opacity-visible tw:[&.shown]:duration-note-in tw:px-action tw:pt-row tw:pb-control tw:rounded-tile tw:shadow-note-shadow" : "ds-power-note tw:fixed tw:left-1/2 tw:bottom-toast-bottom tw:z-note tw:w-power-note-width tw:[transform:var(--ds-panel-note-enter-transform)] tw:opacity-opacity-hidden tw:motion-panel-toast-transition tw:[&.show]:opacity-opacity-visible tw:[&.show]:[transform:var(--ds-panel-toast-shown-transform)] tw:max-panel:bottom-toast-bottom-phone tw:px-content tw:pt-row tw:pb-inline tw:rounded-card tw:shadow-component-toast-shadow");
  const appearances = {
    surface: "tw:bg-surface tw:text-ink tw:border-rule-strong tw:rounded-card",
    raised:
      "tw:bg-surface-raised tw:text-ink tw:border-rule-strong tw:rounded-card",
    material:
      "tw:surface-material-card tw:text-ink tw:border-rule-strong tw:rounded-card tw:shadow-material-lift",
    admin:
      "tw:bg-admin-surface tw:text-admin-ink tw:border-admin-rule tw:rounded-field",
  };
  return (
    "tw:box-border tw:m-flush " +
    "tw:p-action" +
    " tw:border-(length:--ds-stroke-thin) tw:border-solid " + (variant==="admin"?"tw:font-auth-body tw:text-body tw:leading-leading-body tw:tabular-nums ":"tw:font-body tw:leading-leading-body ") +
    appearances[variant]
  );
}
const surfaceRecipe = cardRecipe;
const feedback: Record<FeedbackIntent, string> = {
  neutral: "tw:text-ink-secondary tw:border-rule-strong",
  success: "tw:text-success tw:border-success",
  warning: "tw:text-warning tw:border-warning",
  error: "tw:text-danger tw:border-danger",
  accent: "tw:text-accent tw:border-accent",
};
function badgeRecipeStyles({ intent = "neutral", variant = "standard" }: FeedbackOptions = {}) {
  if (variant === "offline-prepared") return extensions.badge?.("prepared") ?? missingArea("prepared badge");
  if (variant === "library") return extensions.badge?.("tag") ?? missingArea("library badge");
  if(variant === "admin")return "tw:inline-block tw:box-border tw:px-segment tw:py-micro tw:rounded-pill tw:border-(length:--ds-stroke-thin) tw:border-solid tw:bg-transparent tw:font-auth-body tw:text-body-small tw:leading-leading-body " + (intent === "accent" ? "tw:text-admin-accent tw:border-admin-accent" : "tw:text-admin-ink tw:border-admin-rule");
  return (
    "tw:inline-block tw:box-border tw:px-segment tw:py-micro tw:rounded-pill tw:border-(length:--ds-stroke-thin) tw:border-solid tw:bg-transparent tw:font-body tw:text-small tw:leading-leading-body " +
    feedback[intent]
  );
}
function toggleGroupRecipeStyles({
  variant = "segmented",
  separator,
}: ToggleGroupOptions = {}) {
  const itemStyles = (pressed = false) => {
    if(variant==='admin'||variant==='presets'||variant==='admin-language')return "tw:inline-block tw:box-border tw:normal-nums tw:m-flush tw:min-h-touch tw:px-micro tw:py-compact tw:border-0 tw:rounded-field tw:bg-transparent tw:text-body-small tw:leading-leading-admin tw:cursor-pointer tw:text-center tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:[outline-color:var(--ds-admin-accent)] tw:focus-visible:outline-offset-(--ds-space-tight) " + (variant==='admin-language'?"tw:min-w-heading tw:font-auth-mono ":'tw:font-auth-body ') + (pressed?"tw:text-admin-ink tw:font-weight-label tw:underline tw:underline-offset-(--ds-space-control-dense)":"tw:text-admin-secondary tw:font-weight-body");
    if (variant === "language" && separator !== undefined)
      return "tw:inline-block tw:box-border tw:m-flush tw:min-h-panel tw:min-w-heading tw:px-flush tw:py-compact tw:border-0 tw:rounded-field tw:bg-transparent tw:font-auth-mono tw:text-small tw:font-weight-body tw:leading-leading-admin tw:text-center tw:cursor-pointer tw:focus-visible:outline-solid tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:[outline-color:var(--ds-focus)] tw:focus-visible:outline-offset-(--ds-space-compact) " + (pressed ? "tw:text-ink" : "tw:text-ink-secondary");
    if (variant === "segmented")
      return (
        "tw:box-border tw:m-flush tw:inline-flex tw:items-center tw:gap-segment tw:h-panel tw:px-control tw:py-flush tw:rounded-menu tw:border-0 tw:font-control tw:font-weight-label tw:text-body-small tw:whitespace-nowrap tw:cursor-pointer " +
        (pressed
          ? "tw:bg-surface-hover tw:text-ink"
          : "tw:bg-transparent tw:text-ink-secondary")
      );
    const metric =
      variant === "language"
        ? "tw:min-h-panel tw:min-w-heading tw:px-flush tw:py-compact"
        : variant === "transcription"
          ? "tw:min-h-toolbar-dense tw:px-flush tw:py-compact"
          : "tw:min-h-touch tw:px-micro tw:py-compact";
    return (
      "tw:box-border tw:m-flush tw:inline-flex tw:items-center tw:justify-center tw:border-0 tw:rounded-field tw:bg-transparent " +
      "tw:font-auth-mono tw:text-small tw:leading-leading-field" +
      " tw:font-weight-body" + " tw:cursor-pointer tw:disabled:opacity-(--ds-opacity-disabled) tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:[outline-color:var(--ds-focus)] " +
      metric +
      " " +
      (pressed ? "tw:text-ink" : "tw:text-ink-secondary")
    );
  };
  return {
    root: variant==="admin-language" ? "tw:block tw:font-auth-mono tw:text-small tw:leading-leading-admin tw:text-ink-secondary tw:tabular-nums" : (variant==="admin"||variant==="presets") && separator!==undefined ? "tw:block tw:font-auth-body tw:text-body tw:leading-leading-body tw:tabular-nums " + (variant === "presets" ? "tw:text-admin-ink" : "tw:text-admin-secondary") : variant === "language" && separator !== undefined
      ? "tw:block tw:font-auth-mono tw:text-small tw:leading-leading-admin tw:text-ink-secondary"
      : "tw:inline-flex tw:items-center tw:flex-wrap " +
      (variant === "segmented"
        ? "tw:p-tight tw:rounded-segment tw:bg-surface tw:border-(length:--ds-stroke-thin) tw:border-solid tw:border-rule"
        : variant === "transcription"
          ? "tw:gap-inline"
          : "tw:gap-compact"),
    item: (pressed = false) => itemStyles(pressed) + " tw:touch:min-h-control-target-touch tw:touch:min-w-control-target-touch",
  };
}
function toolbarRecipeStyles() {
  return "tw:flex tw:items-center tw:flex-wrap tw:gap-control tw:font-body tw:text-ink";
}
function statusRecipeStyles({ intent = "neutral", variant = "standard" }: FeedbackOptions = {}) {
  if (variant === "account-delete") return extensions.accountError?.() ?? missingArea("account error");
  if (variant === "account") return "tw:block tw:my-content tw:font-auth-body tw:text-body tw:leading-leading-account tw:text-center " + feedback[intent];
  if(variant === "admin")return "tw:normal-nums tw:block tw:my-content tw:font-control tw:text-body tw:leading-leading-body " + feedback[intent];
  return (
    "tw:m-flush tw:font-control tw:text-body-small tw:leading-leading-field " +
    feedback[intent]
  );
}
function emptyStateRecipeStyles({ variant = "standard" }: EmptyStateOptions = {}) {
  return {
    root: "tw:m-flush tw:font-control tw:leading-leading-body tw:gap-control tw:text-center tw:text-ink-secondary tw:min-w-flush " + (variant === "jobs-hidden" ? "tw:hidden" : "tw:grid " + (variant === "compact" ? "tw:py-control" : "tw:py-section tw:max-w-width-empty tw:mx-auto")),
    title: "tw:m-flush tw:font-control tw:font-weight-label tw:text-body tw:leading-leading-body tw:text-ink",
    body: "tw:m-flush tw:font-control tw:text-body-small tw:leading-leading-body tw:text-ink-secondary",
    actions: "tw:flex tw:flex-wrap tw:justify-center tw:gap-control",
  };
}
function loadingRecipeStyles() {
  return "tw:m-flush tw:font-control tw:text-body-small tw:leading-leading-body tw:text-ink-secondary tw:py-control tw:animate-animation-loading tw:motion-reduce:animate-none";
}
function tableRecipeStyles({ variant = "scroll", bounded = false, mono = false }: TableOptions = {}) {
  // D16 A: records become labelled cards below the account breakpoint (one strict threshold for
  // rows, cells, header and wrapper); scroll/metrics stay tables in their own bounded scroller.
  const records = variant === "records";
  const line = "tw:border-0 tw:border-b-(length:--ds-stroke-thin) tw:border-solid";
  return {
    root:
      "tw:w-full tw:border-collapse tw:font-control tw:text-body-small tw:leading-leading-body tw:text-ink tw:tabular-nums " +
      (variant === "metrics" ? "tw:min-w-(--ds-admin-metrics-width)" : "tw:min-w-(--ds-admin-records-width)") +
      (records
        ? " tw:max-account:block tw:max-account:min-w-flush tw:max-account:[&_thead]:block tw:max-account:[&_thead_tr]:flex tw:max-account:[&_thead_tr]:flex-wrap tw:max-account:[&_thead_tr]:gap-x-control tw:max-account:[&_thead_tr]:pb-small tw:max-account:[&_th:not(:has(button))]:hidden tw:max-account:[&_tbody]:grid tw:max-account:[&_tbody]:gap-small tw:max-account:[&_tbody_tr]:grid tw:max-account:[&_tbody_tr]:gap-compact tw:max-account:[&_tbody_tr]:p-control tw:max-account:[&_tbody_tr]:rounded-card tw:max-account:[&_tbody_tr]:border-(length:--ds-stroke-thin) tw:max-account:[&_tbody_tr]:border-solid tw:max-account:[&_tbody_tr]:border-rule tw:max-account:[&_tbody_tr]:bg-surface"
        : ""),
    wrap:
      "tw:max-w-full tw:min-w-flush tw:overflow-x-auto tw:overscroll-x-contain tw:focus-visible:outline-solid tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:outline-focus tw:focus-visible:outline-offset-(--ds-space-compact)" +
      (bounded ? " tw:max-h-(--ds-table-height) tw:overflow-y-auto" : "") +
      (records ? " tw:max-account:overflow-visible tw:max-account:max-h-none" : ""),
    header:
      "tw:text-left tw:align-bottom tw:font-control tw:text-small tw:font-weight-label tw:leading-leading-body tw:text-ink-secondary tw:whitespace-nowrap tw:px-small tw:py-small tw:bg-surface-sunken tw:border-rule-strong " + line +
      (bounded ? " tw:sticky tw:top-flush" : "") +
      (records ? " tw:max-account:static tw:max-account:border-0 tw:max-account:p-flush tw:max-account:bg-transparent" : ""),
    cell:
      "tw:text-left tw:align-top tw:leading-leading-body tw:text-ink tw:tabular-nums tw:px-small tw:py-small tw:max-w-(--ds-table-cell-max) tw:border-rule " + line + " " +
      (mono ? "tw:font-mono tw:text-small tw:whitespace-nowrap" : "tw:font-control tw:text-body-small tw:wrap-anywhere") +
      (records
        ? " tw:max-account:max-w-none tw:max-account:border-0 tw:max-account:p-flush tw:max-account:whitespace-normal tw:max-account:wrap-anywhere tw:max-account:grid tw:max-account:grid-cols-(--ds-admin-definition-columns) tw:max-account:gap-small tw:max-account:before:content-[attr(data-label)] tw:max-account:before:text-small tw:max-account:before:text-ink-secondary tw:max-account:before:font-control"
        : ""),
    row:
      records
        ? "tw:[&[data-href]]:cursor-pointer tw:[&[data-href]]:hover:bg-table-row-hover"
        : "tw:bg-transparent",
    empty: "tw:p-section tw:text-ink-secondary tw:text-left",
    pagination:
      "tw:flex tw:items-center tw:flex-wrap tw:gap-small tw:mt-small tw:font-control tw:text-body-small tw:leading-leading-body tw:text-ink-secondary tw:tabular-nums",
  };
}
function cardRecipe(
  ...args: Parameters<typeof cardRecipeStyles>
): ReturnType<typeof cardRecipeStyles> {
  return normalizeRecipe(cardRecipeStyles(...args));
}
function badgeRecipe(
  ...args: Parameters<typeof badgeRecipeStyles>
): ReturnType<typeof badgeRecipeStyles> {
  return normalizeRecipe(badgeRecipeStyles(...args));
}
function toggleGroupRecipe(
  ...args: Parameters<typeof toggleGroupRecipeStyles>
): ReturnType<typeof toggleGroupRecipeStyles> {
  return normalizeRecipe(toggleGroupRecipeStyles(...args));
}
function toolbarRecipe(
  ...args: Parameters<typeof toolbarRecipeStyles>
): ReturnType<typeof toolbarRecipeStyles> {
  return normalizeRecipe(toolbarRecipeStyles(...args));
}
function statusRecipe(
  ...args: Parameters<typeof statusRecipeStyles>
): ReturnType<typeof statusRecipeStyles> {
  return normalizeRecipe(statusRecipeStyles(...args));
}
function emptyStateRecipe(
  ...args: Parameters<typeof emptyStateRecipeStyles>
): ReturnType<typeof emptyStateRecipeStyles> {
  return normalizeRecipe(emptyStateRecipeStyles(...args));
}
function loadingRecipe(
  ...args: Parameters<typeof loadingRecipeStyles>
): ReturnType<typeof loadingRecipeStyles> {
  return normalizeRecipe(loadingRecipeStyles(...args));
}
function tableRecipe(
  ...args: Parameters<typeof tableRecipeStyles>
): ReturnType<typeof tableRecipeStyles> {
  return normalizeRecipe(tableRecipeStyles(...args));
}
return { surfaceRecipe, cardRecipe, badgeRecipe, toggleGroupRecipe, toolbarRecipe, statusRecipe, emptyStateRecipe, loadingRecipe, tableRecipe };
}
export const { surfaceRecipe, cardRecipe, badgeRecipe, toggleGroupRecipe, toolbarRecipe, statusRecipe, emptyStateRecipe, loadingRecipe, tableRecipe } = /* @__PURE__ */ createDisplayRecipes();
