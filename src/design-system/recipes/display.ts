import { normalizeRecipe } from './normalize';
import { buttonRecipe, type ButtonOptions } from './controls';
export const cardVariants = ['surface', 'raised', 'material', 'admin', 'tour'] as const;
export interface CardOptions {
    variant?: typeof cardVariants[number];
}
function cardRecipeStyles({ variant = 'surface' }: CardOptions = {}) {
    const appearances = { surface: 'tw:bg-surface tw:text-ink tw:border-rule-strong tw:rounded-card', raised: 'tw:bg-surface-raised tw:text-ink tw:border-rule-strong tw:rounded-card', material: 'tw:bg-material-card tw:text-ink tw:border-rule-strong tw:rounded-card tw:shadow-material-lift', admin: 'tw:bg-admin-surface tw:text-admin-ink tw:border-admin-rule tw:rounded-field', tour: 'tw:bg-ink tw:text-surface-sunken tw:border-transparent tw:rounded-transcription-tile' };
    return 'tw:box-border tw:m-0 tw:p-18 tw:border tw:border-solid tw:font-body tw:leading-body ' + appearances[variant];
}
export const surfaceRecipe = cardRecipe;
export const feedbackIntents = ['neutral', 'success', 'warning', 'error', 'accent'] as const;
export type FeedbackIntent = typeof feedbackIntents[number];
export interface FeedbackOptions {
    intent?: FeedbackIntent;
}
const feedback: Record<FeedbackIntent, string> = { neutral: 'tw:text-ink-secondary tw:border-rule-strong', success: 'tw:text-success tw:border-success', warning: 'tw:text-warning tw:border-warning', error: 'tw:text-danger tw:border-danger', accent: 'tw:text-accent tw:border-accent' };
function badgeRecipeStyles({ intent = 'neutral' }: FeedbackOptions = {}) { return 'tw:inline-block tw:box-border tw:px-7 tw:py-2 tw:rounded-chip tw:border tw:border-solid tw:bg-transparent tw:font-body tw:text-small tw:leading-body ' + feedback[intent]; }
export const toggleGroupVariants = ['segmented', 'language', 'transcription', 'admin', 'presets'] as const;
export interface ToggleGroupOptions {
    variant?: typeof toggleGroupVariants[number];
}
function toggleGroupRecipeStyles({ variant = 'segmented' }: ToggleGroupOptions = {}) {
    const item = (pressed = false) => {
        if (variant === 'segmented')
            return 'tw:box-border tw:m-0 tw:inline-flex tw:items-center tw:gap-7 tw:h-32 tw:px-12 tw:py-0 tw:rounded-menu tw:border-0 tw:font-control tw:font-label tw:text-body-small tw:whitespace-nowrap tw:cursor-pointer ' + (pressed ? 'tw:bg-surface-hover tw:text-ink' : 'tw:bg-transparent tw:text-ink-secondary');
        const metric = variant === 'language' ? 'tw:min-h-32 tw:min-w-28 tw:px-0 tw:py-4' : variant === 'transcription' ? 'tw:min-h-36 tw:px-0 tw:py-4' : 'tw:min-h-44 tw:px-2 tw:py-4';
        return 'tw:box-border tw:m-0 tw:inline-flex tw:items-center tw:justify-center tw:border-0 tw:rounded-field tw:bg-transparent tw:font-auth-mono tw:font-regular tw:text-small tw:leading-field tw:cursor-pointer tw:disabled:opacity-(--ds-opacity-disabled) tw:focus-visible:outline-2 tw:focus-visible:outline-focus ' + metric + ' ' + (pressed ? 'tw:text-ink' : 'tw:text-ink-secondary') + (variant === 'admin' && pressed ? ' tw:underline tw:underline-offset-4' : '');
    };
    return { root: 'tw:inline-flex tw:items-center tw:flex-wrap ' + (variant === 'segmented' ? 'tw:p-3 tw:rounded-segment tw:bg-surface tw:border tw:border-solid tw:border-rule' : variant === 'transcription' ? 'tw:gap-10' : 'tw:gap-4'), item };
}
function toolbarRecipeStyles() { return 'tw:flex tw:items-center tw:flex-wrap tw:gap-12 tw:font-body tw:text-ink'; }
function statusRecipeStyles({ intent = 'neutral' }: FeedbackOptions = {}) { return 'tw:m-0 tw:font-body tw:text-body-small tw:leading-field ' + feedback[intent]; }
export const emptyStateVariants = ['landing-actions', 'library-text', 'admin-text', 'jobs-hidden'] as const;
export interface EmptyStateOptions {
    variant?: typeof emptyStateVariants[number];
}
function emptyStateRecipeStyles({ variant = 'library-text' }: EmptyStateOptions = {}) { return { root: 'tw:m-0 tw:font-body tw:leading-body ' + (variant === 'jobs-hidden' ? 'tw:hidden' : variant === 'landing-actions' ? 'tw:grid tw:gap-18 tw:text-center tw:max-w-empty tw:mx-auto tw:py-24' : 'tw:py-24 tw:text-ink-secondary'), title: variant === 'landing-actions' ? 'tw:m-0 tw:font-auth-display tw:text-auth-title' : 'tw:m-0 tw:text-body', body: 'tw:m-0 tw:text-body-small', actions: 'tw:flex tw:flex-wrap tw:justify-center tw:gap-12' }; }
function loadingRecipeStyles() { return statusRecipe() + ' tw:animate-loading tw:motion-reduce:animate-none'; }
export const tableVariants = ['records', 'scroll', 'metrics'] as const;
export interface TableOptions {
    variant?: typeof tableVariants[number];
}
function tableRecipeStyles({ variant = 'scroll' }: TableOptions = {}) {
    return {
        root: (variant === 'records' ? 'ds-table-records tw:max-account:min-w-0 tw:max-account:table-fixed ' : '') + 'tw:w-full tw:min-w-table tw:border-collapse tw:font-auth-body tw:text-body-small tw:leading-body tw:text-admin-ink',
        wrap: 'tw:max-w-full tw:overflow-auto tw:overscroll-contain',
        header: (variant === 'records' ? 'tw:max-account:static tw:max-account:border-0 tw:max-account:whitespace-normal ' : '') + 'tw:sticky tw:top-0 tw:bg-admin-surface tw:text-left tw:font-emphasis tw:whitespace-nowrap tw:px-14 tw:py-12 tw:border-0 tw:border-b tw:border-solid tw:border-admin-rule',
        cell: (variant === 'records' ? 'tw:max-account:block tw:max-account:w-full tw:max-account:min-w-0 tw:max-account:max-w-none tw:max-account:border-0 tw:max-account:whitespace-normal tw:max-account:py-6 tw:max-account:px-10 ' : '') + 'tw:px-14 tw:py-12 tw:text-admin-secondary tw:first:text-admin-ink tw:align-top tw:border-0 tw:border-b tw:border-solid tw:border-admin-rule',
        row: variant === 'records' ? 'tw:hover:bg-surface-hover' : 'tw:bg-transparent',
        empty: 'tw:p-24 tw:text-admin-secondary tw:text-left', pagination: 'tw:flex tw:items-center tw:flex-wrap tw:gap-12 tw:my-12 tw:font-auth-body tw:text-body-small tw:text-admin-secondary',
    };
}
/** Shared appearances; screen-owned data/selection/sorting stay outside recipes. */
export type ToggleItemOptions = ButtonOptions;
export function cardRecipe(...args: Parameters<typeof cardRecipeStyles>): ReturnType<typeof cardRecipeStyles> { return normalizeRecipe(cardRecipeStyles(...args)); }
export function badgeRecipe(...args: Parameters<typeof badgeRecipeStyles>): ReturnType<typeof badgeRecipeStyles> { return normalizeRecipe(badgeRecipeStyles(...args)); }
export function toggleGroupRecipe(...args: Parameters<typeof toggleGroupRecipeStyles>): ReturnType<typeof toggleGroupRecipeStyles> { return normalizeRecipe(toggleGroupRecipeStyles(...args)); }
export function toolbarRecipe(...args: Parameters<typeof toolbarRecipeStyles>): ReturnType<typeof toolbarRecipeStyles> { return normalizeRecipe(toolbarRecipeStyles(...args)); }
export function statusRecipe(...args: Parameters<typeof statusRecipeStyles>): ReturnType<typeof statusRecipeStyles> { return normalizeRecipe(statusRecipeStyles(...args)); }
export function emptyStateRecipe(...args: Parameters<typeof emptyStateRecipeStyles>): ReturnType<typeof emptyStateRecipeStyles> { return normalizeRecipe(emptyStateRecipeStyles(...args)); }
export function loadingRecipe(...args: Parameters<typeof loadingRecipeStyles>): ReturnType<typeof loadingRecipeStyles> { return normalizeRecipe(loadingRecipeStyles(...args)); }
export function tableRecipe(...args: Parameters<typeof tableRecipeStyles>): ReturnType<typeof tableRecipeStyles> { return normalizeRecipe(tableRecipeStyles(...args)); }
