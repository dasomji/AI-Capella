import { libraryCardRecipe, libraryBadgeRecipe } from "./library";
import { accountErrorRecipe } from "./account";
import { normalizeRecipe } from "./normalize";
import { buttonRecipe, type ButtonOptions } from "./controls";
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
function cardRecipeStyles({ variant = "surface" }: CardOptions = {}) {
  if (variant === "library") return libraryCardRecipe();
  if (variant === "tour" || variant === "power-hint") return "tw:box-border tw:m-flush tw:border-0 tw:bg-ink tw:text-surface-sunken tw:font-body tw:leading-leading-body " + (variant === "tour" ? "ds-tour-note tw:absolute tw:left-flush tw:top-flush tw:w-tour-note-width tw:opacity-opacity-hidden tw:motion-panel-tour-transition tw:[&.shown]:opacity-opacity-visible tw:[&.shown]:duration-note-in tw:px-action tw:pt-row tw:pb-control tw:rounded-tile tw:shadow-note-shadow" : "ds-power-note tw:fixed tw:left-1/2 tw:bottom-toast-bottom tw:z-note tw:w-power-note-width tw:[transform:var(--ds-panel-note-enter-transform)] tw:opacity-opacity-hidden tw:motion-panel-toast-transition tw:[&.show]:opacity-opacity-visible tw:[&.show]:[transform:var(--ds-panel-toast-shown-transform)] tw:max-panel:bottom-toast-bottom-phone tw:px-content tw:pt-row tw:pb-inline tw:rounded-card tw:shadow-component-toast-shadow");
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
export const surfaceRecipe = cardRecipe;
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
const feedback: Record<FeedbackIntent, string> = {
  neutral: "tw:text-ink-secondary tw:border-rule-strong",
  success: "tw:text-success tw:border-success",
  warning: "tw:text-warning tw:border-warning",
  error: "tw:text-danger tw:border-danger",
  accent: "tw:text-accent tw:border-accent",
};
function badgeRecipeStyles({ intent = "neutral", variant = "standard" }: FeedbackOptions = {}) {
  if (variant === "offline-prepared") return libraryBadgeRecipe("prepared");
  if (variant === "library") return libraryBadgeRecipe("tag");
  if(variant === "admin")return "tw:inline-block tw:box-border tw:px-segment tw:py-micro tw:rounded-pill tw:border-(length:--ds-stroke-thin) tw:border-solid tw:bg-transparent tw:font-auth-body tw:text-body-small tw:leading-leading-body " + (intent === "accent" ? "tw:text-admin-accent tw:border-admin-accent" : "tw:text-admin-ink tw:border-admin-rule");
  return (
    "tw:inline-block tw:box-border tw:px-segment tw:py-micro tw:rounded-pill tw:border-(length:--ds-stroke-thin) tw:border-solid tw:bg-transparent tw:font-body tw:text-small tw:leading-leading-body " +
    feedback[intent]
  );
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
function toggleGroupRecipeStyles({
  variant = "segmented",
  separator,
}: ToggleGroupOptions = {}) {
  const item = (pressed = false) => {
    if(variant==='admin'||variant==='presets'||variant==='admin-language')return "tw:inline-block tw:box-border tw:m-flush tw:min-h-touch tw:px-micro tw:py-compact tw:border-0 tw:rounded-field tw:bg-transparent tw:text-body-small tw:leading-leading-admin tw:cursor-pointer tw:text-center tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:[outline-color:var(--ds-admin-accent)] tw:focus-visible:outline-offset-tight " + (variant==='admin-language'?"tw:min-w-heading tw:font-auth-mono ":'tw:font-auth-body ') + (pressed?"tw:text-admin-ink tw:font-weight-label tw:underline tw:underline-offset-(--ds-space-control-dense)":"tw:text-admin-secondary tw:font-weight-body");
    if (variant === "language" && separator !== undefined)
      return "tw:inline-block tw:box-border tw:m-flush tw:min-h-panel tw:min-w-heading tw:px-flush tw:py-compact tw:border-0 tw:rounded-field tw:bg-transparent tw:font-auth-mono tw:text-small tw:font-weight-body tw:leading-leading-admin tw:text-center tw:cursor-pointer tw:focus-visible:outline-solid tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:[outline-color:var(--ds-focus)] tw:focus-visible:outline-offset-compact " + (pressed ? "tw:text-ink" : "tw:text-ink-secondary");
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
    item,
  };
}
function toolbarRecipeStyles() {
  return "tw:flex tw:items-center tw:flex-wrap tw:gap-control tw:font-body tw:text-ink";
}
function statusRecipeStyles({ intent = "neutral", variant = "standard" }: FeedbackOptions = {}) {
  if (variant === "account-delete") return accountErrorRecipe();
  if (variant === "account") return "tw:block tw:my-content tw:font-auth-body tw:text-body tw:leading-leading-account tw:text-center " + feedback[intent];
  if(variant === "admin")return "tw:block tw:my-content tw:font-auth-body tw:text-body tw:leading-leading-body tw:text-admin-ink";
  return (
    "tw:m-flush tw:font-body tw:text-body-small tw:leading-leading-field " +
    feedback[intent]
  );
}
export const emptyStateVariants = [
  "landing-actions",
  "library-text",
  "admin-text",
  "jobs-hidden",
] as const;
export interface EmptyStateOptions {
  variant?: (typeof emptyStateVariants)[number];
}
function emptyStateRecipeStyles({
  variant = "library-text",
}: EmptyStateOptions = {}) {
  return {
    root:
      (variant === "admin-text" ? "tw:block tw:my-content tw:font-auth-body tw:text-body tw:text-admin-ink tw:leading-leading-body" : variant === "jobs-hidden"
        ? "tw:m-flush tw:font-body tw:leading-leading-body tw:hidden"
        : variant === "landing-actions"
          ? "tw:m-flush tw:font-body tw:leading-leading-body tw:grid tw:gap-action tw:text-center tw:max-w-width-empty tw:mx-auto tw:py-section"
          : "tw:m-flush tw:font-body tw:leading-leading-body tw:py-section tw:text-ink-secondary"),
    title:
      variant === "admin-text" ? "tw:m-flush tw:font-auth-body tw:text-body tw:leading-leading-body tw:text-admin-ink" : variant === "landing-actions"
        ? "tw:m-flush tw:font-auth-display tw:text-auth-title"
        : "tw:m-flush tw:text-body",
    body: "tw:m-flush tw:text-body-small",
    actions: "tw:flex tw:flex-wrap tw:justify-center tw:gap-control",
  };
}
function loadingRecipeStyles() {
  return statusRecipe() + " tw:animate-animation-loading tw:motion-reduce:animate-none";
}
/** scroll/metrics intentionally alias until D16; records owns the responsive layout. */
export const tableVariants = ["records", "scroll", "metrics"] as const;
export interface TableOptions {
  bounded?: boolean;
  mono?: boolean;
  variant?: (typeof tableVariants)[number];
}
function tableRecipeStyles({ variant = "scroll", bounded = false, mono = false }: TableOptions = {}) {
  return {
    root:
      (variant === "records"
        ? "ds-table-records tw:max-account:min-w-flush tw:[@media_(max-width:_theme(--breakpoint-account))]:table-fixed tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_thead]:flex tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_thead_tr]:flex tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_thead]:flex-wrap tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_thead_tr]:flex-wrap tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_thead]:gap-small tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_thead_tr]:gap-small tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_th:not(:has(button))]:hidden tw:max-account:[&_th]:static tw:max-account:[&_th]:border-0 tw:max-account:[&_th]:whitespace-normal tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_tbody]:block tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_tbody_tr]:block tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_tbody]:w-full tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_tbody_tr]:w-full tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_tbody_tr]:border-0 tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_tbody_tr]:[border-bottom-width:var(--ds-stroke-thin)] tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_tbody_tr]:border-solid tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_tbody_tr]:border-admin-rule tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_tbody_tr]:py-inline tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_tbody_tr]:px-flush tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_td]:block tw:max-account:[&_td]:min-w-flush tw:max-account:[&_td]:max-w-none tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_td]:w-full tw:max-account:[&_td]:border-0 tw:max-account:[&_td]:whitespace-normal tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_td]:wrap-anywhere tw:max-account:[&_td]:py-snug tw:max-account:[&_td]:px-inline tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_td]:before:content-[attr(data-label)] tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_td]:before:block tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_td]:before:font-inherit tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_td]:before:font-family-inherit tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_td]:before:normal-nums tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_td]:before:text-small tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_td]:before:[line-height:inherit] tw:[@media_(max-width:_theme(--breakpoint-account))]:[&_td]:before:text-admin-secondary "
        : "") +
      "tw:w-full tw:min-w-width-table tw:border-collapse tw:font-auth-body tw:text-body-small tw:leading-leading-body tw:text-admin-ink tw:tabular-nums",
    wrap: "tw:max-w-full tw:overflow-auto tw:overscroll-contain" + (bounded ? " tw:max-h-(--ds-table-height)" : "") + (variant === "records" ? " tw:max-account:overflow-visible tw:max-account:max-h-none" : ""),
    header:
      (variant === "records"
        ? "tw:max-account:static tw:max-account:border-0 tw:max-account:whitespace-normal "
        : "") +
      "tw:font-auth-body tw:text-body-small tw:leading-leading-body tw:text-admin-ink tw:tabular-nums tw:align-middle tw:max-account:px-inline tw:max-account:py-inline tw:sticky tw:top-flush tw:bg-admin-surface tw:text-left tw:font-weight-medium tw:whitespace-nowrap tw:px-row tw:py-control tw:border-0 tw:border-b-(length:--ds-stroke-thin) tw:border-solid tw:border-admin-rule",
    cell:
      (variant === "records"
        ? "tw:max-account:block tw:max-account:w-full tw:max-account:min-w-flush tw:max-account:max-w-none tw:max-account:border-0 tw:max-account:whitespace-normal tw:max-account:py-snug tw:max-account:px-inline "
        : "") +
      (mono ? "tw:min-w-(--ds-table-cell-mono-min) tw:font-auth-mono tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis tw:max-account:overflow-visible tw:max-account:wrap-anywhere" : "tw:min-w-(--ds-table-cell-min) tw:font-auth-body") + " tw:text-body-small tw:leading-leading-body tw:tabular-nums tw:max-w-(--ds-table-cell-max) tw:px-row tw:py-control " + (variant === "records" ? "" : "tw:max-account:p-inline ") + "tw:text-admin-secondary tw:first:text-admin-ink tw:align-top tw:border-0 tw:border-b-(length:--ds-stroke-thin) tw:border-solid tw:border-admin-rule",
    row:
      variant === "records" ? "tw:[&[tabindex]]:hover:bg-table-row-hover tw:[&[tabindex]]:cursor-pointer" : "tw:bg-transparent",
    empty: "tw:p-section tw:text-admin-secondary tw:text-left",
    pagination:
      "tw:flex tw:items-center tw:flex-wrap tw:gap-control tw:mt-control tw:mb-section tw:font-auth-body tw:text-body tw:leading-leading-body tw:text-admin-ink tw:tabular-nums",
  };
}
/** Shared appearances; screen-owned data/selection/sorting stay outside recipes. */
export type ToggleItemOptions = ButtonOptions;
export function cardRecipe(
  ...args: Parameters<typeof cardRecipeStyles>
): ReturnType<typeof cardRecipeStyles> {
  return normalizeRecipe(cardRecipeStyles(...args));
}
export function badgeRecipe(
  ...args: Parameters<typeof badgeRecipeStyles>
): ReturnType<typeof badgeRecipeStyles> {
  return normalizeRecipe(badgeRecipeStyles(...args));
}
export function toggleGroupRecipe(
  ...args: Parameters<typeof toggleGroupRecipeStyles>
): ReturnType<typeof toggleGroupRecipeStyles> {
  return normalizeRecipe(toggleGroupRecipeStyles(...args));
}
export function toolbarRecipe(
  ...args: Parameters<typeof toolbarRecipeStyles>
): ReturnType<typeof toolbarRecipeStyles> {
  return normalizeRecipe(toolbarRecipeStyles(...args));
}
export function statusRecipe(
  ...args: Parameters<typeof statusRecipeStyles>
): ReturnType<typeof statusRecipeStyles> {
  return normalizeRecipe(statusRecipeStyles(...args));
}
export function emptyStateRecipe(
  ...args: Parameters<typeof emptyStateRecipeStyles>
): ReturnType<typeof emptyStateRecipeStyles> {
  return normalizeRecipe(emptyStateRecipeStyles(...args));
}
export function loadingRecipe(
  ...args: Parameters<typeof loadingRecipeStyles>
): ReturnType<typeof loadingRecipeStyles> {
  return normalizeRecipe(loadingRecipeStyles(...args));
}
export function tableRecipe(
  ...args: Parameters<typeof tableRecipeStyles>
): ReturnType<typeof tableRecipeStyles> {
  return normalizeRecipe(tableRecipeStyles(...args));
}
