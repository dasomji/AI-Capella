import { normalizeRecipe } from './normalize';
import { controlBase, disabledRecipe } from './controls';
export const dialogVariants = ['dialog', 'sheet', 'drawer', 'confirm', 'transcription', 'admin-confirm'] as const;
export type DialogVariant = typeof dialogVariants[number];
export interface DialogOptions {
    variant?: DialogVariant;
}
function dialogRecipeStyles({ variant = 'dialog' }: DialogOptions = {}) {
    const shapes: Record<DialogVariant, string> = {
        dialog: 'tw:w-dialog tw:max-w-dialog tw:rounded-dialog tw:p-24 tw:shadow-component-overlay',
        confirm: 'tw:w-dialog tw:max-w-dialog tw:rounded-dialog tw:p-24 tw:shadow-component-overlay',
        sheet: 'tw:fixed tw:inset-x-0 tw:bottom-0 tw:m-0 tw:w-full tw:max-w-none tw:max-h-sheet tw:rounded-t-sheet tw:p-20 tw:panel:inset-x-auto tw:panel:left-sheet tw:panel:bottom-24 tw:panel:w-sheet tw:panel:rounded-transcription-dialog',
        drawer: 'tw:fixed tw:inset-y-0 tw:right-0 tw:m-0 tw:h-full tw:w-drawer tw:max-w-full tw:rounded-field tw:p-28 tw:shadow-admin-detail',
        transcription: 'tw:w-transcription tw:max-w-dialog tw:rounded-transcription-dialog tw:p-20 tw:font-auth-body',
        'admin-confirm': 'tw:w-sheet tw:max-w-dialog tw:rounded-field tw:p-28 tw:shadow-admin-confirm',
    };
    return { panel: 'tw:box-border tw:border tw:border-solid tw:outline-none tw:overflow-auto tw:overscroll-contain tw:max-h-dialog tw:bg-surface-raised tw:text-ink tw:border-rule-strong tw:font-body tw:leading-body tw:backdrop:bg-backdrop tw:motion-reduce:transition-none ' + shapes[variant],
        content: 'tw:grid tw:gap-14', header: 'tw:flex tw:items-center tw:justify-between tw:gap-20', title: 'tw:m-0 tw:font-display tw:text-dialog tw:font-emphasis tw:leading-label tw:wrap-anywhere', body: 'tw:m-0 tw:text-ink-secondary tw:font-body tw:text-body tw:leading-body', actions: 'tw:flex tw:justify-end tw:gap-10 tw:mt-6' };
}
export const sheetRecipe = () => dialogRecipe({ variant: 'sheet' });
export const drawerRecipe = () => dialogRecipe({ variant: 'drawer' });
export const confirmRecipe = () => dialogRecipe({ variant: 'confirm' });
export const menuVariants = ['popover', 'sheet', 'member', 'admin'] as const;
export interface MenuOptions {
    variant?: typeof menuVariants[number];
}
function menuRecipeStyles({ variant = 'popover' }: MenuOptions = {}) { return { root: 'tw:grid tw:gap-0 tw:box-border tw:p-8 tw:rounded-transcription-tile tw:border tw:border-solid tw:border-rule-strong tw:bg-surface-raised tw:text-ink tw:font-body tw:shadow-menu', item: controlBase + ' ' + disabledRecipe + ' ds-menu-item tw:flex tw:items-center tw:gap-12 tw:min-h-44 tw:px-12 tw:py-0 tw:rounded-control tw:border-0 tw:bg-transparent tw:font-label tw:text-button tw:text-left tw:cursor-pointer ' + (variant === 'admin' ? 'tw:font-auth-mono' : ''), danger: 'tw:text-danger!', check: 'tw:ml-auto tw:text-menu-check' }; }
export const toastVariants = ['info', 'error'] as const;
export interface ToastOptions {
    kind?: typeof toastVariants[number];
    variant?: 'standard' | 'legacy';
}
function toastRecipeStyles({ kind = 'info', variant = 'standard' }: ToastOptions = {}) { if (variant === 'legacy')
    return 'ds-toast-legacy' + (kind === 'error' ? ' error' : ''); return 'tw:box-border tw:px-16 tw:py-12 tw:rounded-card tw:font-body tw:text-toast tw:font-label tw:leading-body tw:shadow-component-toast ' + (kind === 'error' ? 'tw:bg-danger tw:text-surface-sunken' : 'tw:bg-ink tw:text-surface-sunken'); }
export function dialogRecipe(...args: Parameters<typeof dialogRecipeStyles>): ReturnType<typeof dialogRecipeStyles> { return normalizeRecipe(dialogRecipeStyles(...args)); }
export function menuRecipe(...args: Parameters<typeof menuRecipeStyles>): ReturnType<typeof menuRecipeStyles> { return normalizeRecipe(menuRecipeStyles(...args)); }
export function toastRecipe(...args: Parameters<typeof toastRecipeStyles>): ReturnType<typeof toastRecipeStyles> { return args[0]?.variant === 'legacy' ? toastRecipeStyles(...args) : normalizeRecipe(toastRecipeStyles(...args)); }
