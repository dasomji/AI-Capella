import { normalizeRecipe } from "./normalize";
import { buttonRecipe, type ButtonOptions } from "./controls";
export const cardVariants = [
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
  if (variant === "tour" || variant === "power-hint") return "tw:box-border tw:m-0 tw:border-0 tw:bg-ink tw:text-surface-sunken tw:font-body tw:leading-body " + (variant === "tour" ? "ds-tour-note tw:px-18 tw:pt-14 tw:pb-12 tw:rounded-transcription-tile tw:shadow-note" : "ds-power-note tw:px-16 tw:pt-14 tw:pb-10 tw:rounded-card tw:shadow-component-toast");
  const appearances = {
    surface: "tw:bg-surface tw:text-ink tw:border-rule-strong tw:rounded-card",
    raised:
      "tw:bg-surface-raised tw:text-ink tw:border-rule-strong tw:rounded-card",
    material:
      "tw:bg-material-card tw:text-ink tw:border-rule-strong tw:rounded-card tw:shadow-material-lift",
    admin:
      "tw:bg-admin-surface tw:text-admin-ink tw:border-admin-rule tw:rounded-field",
  };
  return (
    "tw:box-border tw:m-0 " +
    "tw:p-18" +
    " tw:border tw:border-solid " + (variant==="admin"?"tw:font-auth-body tw:text-body tw:leading-body tw:tabular-nums ":"tw:font-body tw:leading-body ") +
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
  variant?: "standard" | "admin" | "account";
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
  if(variant === "admin")return "tw:inline-block tw:box-border tw:px-7 tw:py-2 tw:rounded-chip tw:border tw:border-solid tw:bg-transparent tw:font-auth-body tw:text-body-small tw:leading-body " + (intent === "accent" ? "tw:text-admin-accent tw:border-admin-accent" : "tw:text-admin-ink tw:border-admin-rule");
  return (
    "tw:inline-block tw:box-border tw:px-7 tw:py-2 tw:rounded-chip tw:border tw:border-solid tw:bg-transparent tw:font-body tw:text-small tw:leading-body " +
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
    if(variant==='admin'||variant==='presets'||variant==='admin-language')return "tw:inline-block tw:box-border tw:m-0 tw:min-h-44 tw:px-2 tw:py-4 tw:border-0 tw:rounded-field tw:bg-transparent tw:text-body-small tw:leading-admin tw:cursor-pointer tw:text-center tw:focus-visible:outline-2 tw:focus-visible:outline-admin-accent tw:focus-visible:outline-offset-3 " + (variant==='admin-language'?'tw:min-w-28 tw:font-auth-mono ':'tw:font-auth-body ') + (pressed?'tw:text-admin-ink tw:font-label tw:underline tw:underline-offset-5':'tw:text-admin-secondary tw:font-regular');
    if (variant === "language" && separator !== undefined)
      return "tw:inline-block tw:box-border tw:m-0 tw:min-h-32 tw:min-w-28 tw:px-0 tw:py-4 tw:border-0 tw:rounded-field tw:bg-transparent tw:font-auth-mono tw:text-small tw:font-regular tw:leading-admin tw:text-center tw:cursor-pointer tw:focus-visible:outline-solid tw:focus-visible:outline-2 tw:focus-visible:outline-focus tw:focus-visible:outline-offset-4 " + (pressed ? "tw:text-ink" : "tw:text-ink-secondary");
    if (variant === "segmented")
      return (
        "tw:box-border tw:m-0 tw:inline-flex tw:items-center tw:gap-7 tw:h-32 tw:px-12 tw:py-0 tw:rounded-menu tw:border-0 tw:font-control tw:font-label tw:text-body-small tw:whitespace-nowrap tw:cursor-pointer " +
        (pressed
          ? "tw:bg-surface-hover tw:text-ink"
          : "tw:bg-transparent tw:text-ink-secondary")
      );
    const metric =
      variant === "language"
        ? "tw:min-h-32 tw:min-w-28 tw:px-0 tw:py-4"
        : variant === "transcription"
          ? "tw:min-h-36 tw:px-0 tw:py-4"
          : "tw:min-h-44 tw:px-2 tw:py-4";
    return (
      "tw:box-border tw:m-0 tw:inline-flex tw:items-center tw:justify-center tw:border-0 tw:rounded-field tw:bg-transparent " +
      "tw:font-auth-mono tw:text-small tw:leading-field" +
      " tw:font-regular" + " tw:cursor-pointer tw:disabled:opacity-(--ds-opacity-disabled) tw:focus-visible:outline-2 tw:focus-visible:outline-focus " +
      metric +
      " " +
      (pressed ? "tw:text-ink" : "tw:text-ink-secondary")
    );
  };
  return {
    root: variant==="admin-language" ? "tw:block tw:font-auth-mono tw:text-small tw:leading-admin tw:text-ink-secondary tw:tabular-nums" : (variant==="admin"||variant==="presets") && separator!==undefined ? "tw:block tw:font-auth-body tw:text-body tw:leading-body tw:tabular-nums " + (variant === "presets" ? "tw:text-admin-ink" : "tw:text-admin-secondary") : variant === "language" && separator !== undefined
      ? "tw:block tw:font-auth-mono tw:text-small tw:leading-admin tw:text-ink-secondary"
      : "tw:inline-flex tw:items-center tw:flex-wrap " +
      (variant === "segmented"
        ? "tw:p-3 tw:rounded-segment tw:bg-surface tw:border tw:border-solid tw:border-rule"
        : variant === "transcription"
          ? "tw:gap-10"
          : "tw:gap-4"),
    item,
  };
}
function toolbarRecipeStyles() {
  return "tw:flex tw:items-center tw:flex-wrap tw:gap-12 tw:font-body tw:text-ink";
}
function statusRecipeStyles({ intent = "neutral", variant = "standard" }: FeedbackOptions = {}) {
  if (variant === "account") return "tw:block tw:my-16 tw:font-auth-body tw:text-body tw:leading-account tw:text-center " + feedback[intent];
  if(variant === "admin")return "tw:block tw:my-16 tw:font-auth-body tw:text-body tw:leading-body tw:text-admin-ink";
  return (
    "tw:m-0 tw:font-body tw:text-body-small tw:leading-field " +
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
      (variant === "admin-text" ? "tw:block tw:my-16 tw:font-auth-body tw:text-body tw:text-admin-ink tw:leading-body" : variant === "jobs-hidden"
        ? "tw:m-0 tw:font-body tw:leading-body tw:hidden"
        : variant === "landing-actions"
          ? "tw:m-0 tw:font-body tw:leading-body tw:grid tw:gap-18 tw:text-center tw:max-w-empty tw:mx-auto tw:py-24"
          : "tw:m-0 tw:font-body tw:leading-body tw:py-24 tw:text-ink-secondary"),
    title:
      variant === "admin-text" ? "tw:m-0 tw:font-auth-body tw:text-body tw:leading-body tw:text-admin-ink" : variant === "landing-actions"
        ? "tw:m-0 tw:font-auth-display tw:text-auth-title"
        : "tw:m-0 tw:text-body",
    body: "tw:m-0 tw:text-body-small",
    actions: "tw:flex tw:flex-wrap tw:justify-center tw:gap-12",
  };
}
function loadingRecipeStyles() {
  return statusRecipe() + " tw:animate-loading tw:motion-reduce:animate-none";
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
        ? "ds-table-records tw:max-account:min-w-0 tw:max-account:table-fixed "
        : "") +
      "tw:w-full tw:min-w-table tw:border-collapse tw:font-auth-body tw:text-body-small tw:leading-body tw:text-admin-ink tw:tabular-nums",
    wrap: "tw:max-w-full tw:overflow-auto tw:overscroll-contain" + (bounded ? " tw:max-h-(--ds-table-height)" : "") + (variant === "records" ? " tw:max-account:overflow-visible tw:max-account:max-h-none" : ""),
    header:
      (variant === "records"
        ? "tw:max-account:static tw:max-account:border-0 tw:max-account:whitespace-normal "
        : "") +
      "tw:font-auth-body tw:text-body-small tw:leading-body tw:text-admin-ink tw:tabular-nums tw:align-middle tw:max-account:px-10 tw:max-account:py-10 tw:sticky tw:top-0 tw:bg-admin-surface tw:text-left tw:font-emphasis tw:whitespace-nowrap tw:px-14 tw:py-12 tw:border-0 tw:border-b tw:border-solid tw:border-admin-rule",
    cell:
      (variant === "records"
        ? "tw:max-account:block tw:max-account:w-full tw:max-account:min-w-0 tw:max-account:max-w-none tw:max-account:border-0 tw:max-account:whitespace-normal tw:max-account:py-6 tw:max-account:px-10 "
        : "") +
      (mono ? "tw:min-w-(--ds-table-cell-mono-min) tw:font-auth-mono tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis tw:max-account:overflow-visible tw:max-account:wrap-anywhere" : "tw:min-w-(--ds-table-cell-min) tw:font-auth-body") + " tw:text-body-small tw:leading-body tw:tabular-nums tw:max-w-(--ds-table-cell-max) tw:px-14 tw:py-12 " + (variant === "records" ? "" : "tw:max-account:p-10 ") + "tw:text-admin-secondary tw:first:text-admin-ink tw:align-top tw:border-0 tw:border-b tw:border-solid tw:border-admin-rule",
    row:
      variant === "records" ? "tw:[&[tabindex]]:hover:bg-table-row-hover tw:[&[tabindex]]:cursor-pointer" : "tw:bg-transparent",
    empty: "tw:p-24 tw:text-admin-secondary tw:text-left",
    pagination:
      "tw:flex tw:items-center tw:flex-wrap tw:gap-12 tw:mt-12 tw:mb-24 tw:font-auth-body tw:text-body tw:leading-body tw:text-admin-ink tw:tabular-nums",
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
