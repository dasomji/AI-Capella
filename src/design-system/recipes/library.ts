import { accountUtilityRecipe } from "./account";
import { normalizeRecipe } from "./normalize";
/** Utilities retain hooks for behavior; every authored value resolves through tokens. */
const librarySlots = {
  "ds-library-button":
    "tw:font-inherit tw:color-inherit tw:background-library-clear tw:border-0 tw:p-0 tw:cursor-pointer " +
    "tw:library-button-disabled:cursor-default tw:library-button-disabled:opacity-library-opacity-disabled " +
    "tw:library-button-focus-visible:outline-library-button-outline tw:library-button-focus-visible:outline-offset-(--ds-space-micro)",
  "ds-library-mode-btn":
    "tw:library-mode-btn-last-used:border-library-mode-btn-last-used-border-color " +
    "tw:library-mode-btn-last-used:shadow-library-mode-btn-last-used-box-shadow tw:inline-flex tw:items-center " +
    "tw:gap-10 tw:h-library-mode-btn-height tw:p-library-mode-btn-padding tw:rounded-chip " +
    "tw:border-library-mode-btn-border tw:background-library-mode-btn-background-2 " +
    "tw:backdrop-filter-library-mode-btn-backdrop-filter-2 tw:text-library-radius-transcription-card tw:font-label " +
    "tw:transition-library-mode-btn-transition tw:webkit-backdrop-filter-library-mode-btn-webkit-backdrop-filter " +
    "tw:border-library-mode-btn-border-color tw:shadow-library-mode-btn-box-shadow tw:text-library-mode-btn-color " +
    "tw:text-shadow-library-mode-btn-text-shadow " +
    "tw:library-mode-btn-hover:border-library-mode-btn-hover-border-color " +
    "tw:library-mode-btn-hover:background-library-mode-btn-hover-background " +
    "tw:library-mode-btn-hover:shadow-library-mode-btn-hover-box-shadow " +
    "tw:library-mode-btn-active:transform-library-mode-btn-active-transform " +
    "tw:library-mode-btn-base-max-phone-wide:justify-center " +
    "tw:library-mode-btn-base-opaque:webkit-backdrop-filter-none " +
    "tw:library-mode-btn-base-opaque:backdrop-filter-none " +
    "tw:library-mode-btn-base-opaque:background-library-opaque-mode-btn-background " +
    "tw:library-mode-btn-root-data-start-neu:h-library-mode-btn-height-neu " +
    "tw:library-mode-btn-root-data-start-neu:p-library-neu--mode-btn-padding " +
    "tw:library-mode-btn-root-data-start-neu:border-0 " +
    "tw:library-mode-btn-root-data-start-neu:rounded-library-space-10 " +
    "tw:library-mode-btn-root-data-start-neu:background-library-neu-mode-btn-background " +
    "tw:library-mode-btn-root-data-start-neu:webkit-backdrop-filter-none " +
    "tw:library-mode-btn-root-data-start-neu:backdrop-filter-none " +
    "tw:library-mode-btn-root-data-start-neu:text-library-neu--mode-btn-color " +
    "tw:library-mode-btn-root-data-start-neu:text-shadow-library-neu--mode-btn-text-shadow " +
    "tw:library-mode-btn-root-data-start-neu:shadow-library-neu--mode-btn-box-shadow " +
    "tw:library-mode-btn-root-data-start-neu:transition-library-neu-mode-btn-transition " +
    "tw:library-mode-btn-root-data-start-neu-ic:filter-library-neu-mode-btn-ic-filter " +
    "tw:library-mode-btn-root-data-start-neu-hover:background-library-neu-mode-btn-hover-background " +
    "tw:library-mode-btn-root-data-start-neu-hover:transform-library-neu-mode-btn-hover-transform " +
    "tw:library-mode-btn-root-data-start-neu-hover:shadow-library-neu--mode-btn-hover-box-shadow " +
    "tw:library-mode-btn-root-data-start-neu-active:transform-none " +
    "tw:library-mode-btn-root-data-start-neu-active:shadow-library-neu--mode-btn-active-box-shadow " +
    "tw:library-mode-btn-root-data-start-neu-last-used:shadow-library-neu--mode-btn-last-used-box-shadow " +
    "tw:library-mode-btn-root-data-title-buehne-last-used:background-library-buehne-mode-btn-last-used-background " +
    "tw:library-mode-btn-root-data-title-buehne-last-used:text-library-buehne--mode-btn-last-used-color " +
    "tw:library-mode-btn-root-data-title-buehne-last-used:text-shadow-library-buehne--mode-btn-last-used-text-shadow " +
    "tw:library-mode-btn-root-data-title-buehne-last-used:shadow-library-buehne--mode-btn-last-used-box-shadow " +
    "tw:library-mode-btn-root-data-title-buehne-last-used-ic:filter-none " +
    "tw:library-mode-btn-ic:filter-library-mode-btn-ic-filter",
  "ds-library-search":
    "tw:flex tw:items-center tw:gap-library-radius-menu tw:w-library-search-width tw:max-w-full " +
    "tw:h-library-search-height tw:p-library-search-padding tw:rounded-library-search-border-radius " +
    "tw:border-library-search-border tw:background-library-search-background-2 tw:text-library-search-color " +
    "tw:webkit-backdrop-filter-library-search-webkit-backdrop-filter " +
    "tw:backdrop-filter-library-search-backdrop-filter tw:border-library-search-border-color " +
    "tw:shadow-library-search-box-shadow tw:library-search-input:flex-1 tw:library-search-input:min-w-0 " +
    "tw:library-search-input:border-0 tw:library-search-input:background-library-clear tw:library-search-input:outline-none " +
    "tw:library-search-input:text-library-search-input-color tw:library-search-input:text-button " +
    "tw:library-search-focus-within:border-library-search-focus-within-border-color " +
    "tw:library-search-base-max-compact:w-full tw:library-search-base-opaque:webkit-backdrop-filter-none " +
    "tw:library-search-base-opaque:backdrop-filter-none " +
    "tw:library-search-base-opaque:background-library-opaque-search-background",
  "ds-library-banner":
    "tw:max-w-library-banner-max-width tw:m-library-banner-margin tw:flex tw:items-center tw:justify-between " +
    "tw:gap-library-radius-transcription-card tw:p-library-banner-padding tw:rounded-library-banner-border-radius " +
    "tw:background-library-banner-background-2 tw:border-library-banner-border tw:text-library-banner-color " +
    "tw:text-toast tw:webkit-backdrop-filter-library-banner-webkit-backdrop-filter " +
    "tw:backdrop-filter-library-banner-backdrop-filter tw:border-library-banner-border-color " +
    "tw:shadow-library-banner-box-shadow tw:library-banner-b:block tw:library-banner-b:text-library-banner-b-color " +
    "tw:library-banner-b:text-button tw:library-banner-b:mb-library-stroke-focus " +
    "tw:library-banner-muted:background-library-clear tw:library-banner-base-opaque:webkit-backdrop-filter-none " +
    "tw:library-banner-base-opaque:backdrop-filter-none " +
    "tw:library-banner-base-opaque:background-library-opaque-banner-background",
  "ds-library-song-grid":
    "tw:list-none tw:m-library-song-grid-margin tw:p-0 tw:max-w-library-song-grid-max-width tw:grid " +
    "tw:grid-cols-library-song-grid-grid-template-columns tw:gap-library-size-section " +
    "tw:library-song-grid-base-max-compact:grid-cols-1 tw:library-song-grid-base-max-compact:gap-0",
  "ds-library-song-card":
    "tw:relative tw:rounded-library-radius-transcription-card tw:background-library-song-card-background-2 " +
    "tw:border-library-song-card-border tw:overflow-hidden tw:transition-library-song-card-transition " +
    "tw:border-library-song-card-border-color tw:shadow-library-song-card-box-shadow " +
    "tw:library-song-card-hover:border-library-song-card-hover-border-color-2 " +
    "tw:library-song-card-hover:transform-library-song-card-hover-transform " +
    "tw:library-song-card-ds-library-tag:absolute tw:library-song-card-ds-library-tag:top-10 " +
    "tw:library-song-card-ds-library-tag:left-10 " +
    "tw:library-song-card-ds-library-tag:background-library-song-card-tag-background " +
    "tw:library-song-card-skeleton:min-h-library-song-card-min-height " +
    "tw:library-song-card-skeleton:background-library-song-card-skeleton-background-2 " +
    "tw:library-song-card-skeleton:animate-library-song-card-skeleton-animation " +
    "tw:library-song-card-base-max-compact:rounded-library-song-card-border-radius " +
    "tw:library-song-card-base-max-compact:border-0 " +
    "tw:library-song-card-base-max-compact:border-bottom-library-phone-song-card-border-bottom tw:library-song-card-base-max-compact:border-library-song-card-border-color " +
    "tw:library-song-card-hover-max-compact:transform-none " +
    "tw:library-song-card-ds-library-tag-max-compact:top-library-radius-round " +
    "tw:library-song-card-ds-library-tag-max-compact:left-auto " +
    "tw:library-song-card-ds-library-tag-max-compact:right-0 " +
    "tw:library-song-card-ds-library-tag-max-compact:transform-library-phone-song-card-tag-transform " +
    "tw:library-song-card-ds-library-tag-max-compact:p-library-phone-song-card-tag-padding " +
    "tw:library-song-card-ds-library-tag-max-compact:text-library-phone-song-card-tag-font-size " +
    "tw:library-song-card-skeleton-max-compact:min-h-library-song-card-min-height-phone " +
    "tw:library-song-card-base-fine-pointer:transform-library-card-tilt " +
    "tw:library-song-card-base-fine-pointer:transition-library-pointer-song-card-transition " +
    "tw:library-song-card-is-tilted-fine-pointer:transform-library-card-lifted-tilt " +
    "tw:library-song-card-is-tilted-fine-pointer:transition-library-pointer-song-card-is-tilted-transition " +
    "tw:library-song-card-is-tilted-fine-pointer:shadow-library-pointer-song-card-is-tilted-box-shadow " +
    "tw:library-song-card-data-id:webkit-touch-callout-none tw:library-song-card-data-id:webkit-user-select-none " +
    "tw:library-song-card-data-id:select-none tw:library-song-card-lifted:z-toolbar " +
    "tw:library-song-card-lifted:pointer-events-none " +
    "tw:library-song-card-lifted:background-library-song-card-lifted-background " +
    "tw:library-song-card-lifted:border-library-song-card-lifted-border " +
    "tw:library-song-card-lifted:rounded-transcription-tile " +
    "tw:library-song-card-lifted:shadow-library-song-card-lifted-box-shadow " +
    "tw:library-song-card-lifted:scale-library-song-card-lifted-scale " +
    "tw:library-song-card-lifted:transition-library-song-card-lifted-transition",
  "ds-library-song-open":
    "tw:block tw:w-full tw:text-left " +
    "tw:library-song-open-focus-visible:outline-offset-(--ds-library-song-open-focus-visible-outline-offset) " +
    "tw:library-song-open-base-max-compact:grid " +
    "tw:library-song-open-base-max-compact:grid-cols-library-song-open-grid-template-columns " +
    "tw:library-song-open-base-max-compact:items-center " +
    "tw:library-song-open-base-max-compact:gap-library-radius-transcription-tile " +
    "tw:library-song-open-base-max-compact:p-library-phone-song-open-padding " +
    "tw:library-song-open-ds-library-cover-max-compact:w-library-song-open-width " +
    "tw:library-song-open-ds-library-cover-max-compact:h-library-song-open-height " +
    "tw:library-song-open-ds-library-cover-max-compact:aspect-auto " +
    "tw:library-song-open-ds-library-cover-max-compact:rounded-card",
  "ds-library-cover":
    "tw:block tw:w-full tw:aspect-library-cover-aspect-ratio tw:background-library-cover-background-2 " +
    "tw:overflow-clip",
  "ds-library-song-body":
    "tw:grid tw:gap-library-radius-menu tw:p-library-song-body-padding tw:text-left " +
    "tw:library-song-body-base-max-compact:p-0 tw:library-song-body-base-max-compact:gap-6",
  "ds-library-song-title":
    "tw:font-library-song-title-font tw:wrap-anywhere tw:text-align-inherit " +
    "tw:library-song-title-base-max-compact:text-section tw:library-song-title-base-max-compact:p-0 " +
    "tw:library-song-title-root-data-type-revival:font-library-revival--song-title-font-family " +
    "tw:library-song-title-root-data-type-revival:font-regular " +
    "tw:library-song-title-root-data-type-revival:font-synthesis-none " +
    "tw:library-song-title-root-data-type-revival:tracking-library-revival--song-title-letter-spacing " +
    "tw:library-song-title-root-data-type-revival:text-library-radius-transcription-dialog " +
    "tw:library-song-title-root-data-type-revival:leading-label",
  "ds-library-song-meta":
    "tw:flex tw:items-center tw:flex-wrap tw:gap-library-song-meta-gap tw:min-h-library-song-meta-min-height " +
    "tw:text-library-song-meta-color tw:text-library-song-meta-font-size tw:text-align-inherit " +
    "tw:library-song-meta-root-data-type-revival:text-library-radius-card " +
    "tw:library-song-meta-root-data-type-revival:white-space-library-revival-song-meta-white-space",
  "ds-library-vdots":
    "tw:inline-flex tw:gap-library-radius-admin-control tw:flex-none tw:library-vdots-i:w-library-vdots-width " +
    "tw:library-vdots-i:h-library-vdots-height tw:library-vdots-i:rounded-round tw:library-vdots-i:bg-library-voice",
  "ds-library-song-more":
    "tw:absolute tw:right-library-radius-menu tw:top-library-radius-menu tw:background-library-song-more-background " +
    "tw:text-library-song-more-color tw:text-center tw:library-song-more-base-max-compact:top-library-radius-round " +
    "tw:library-song-more-base-max-compact:right-library-phone-song-more-right " +
    "tw:library-song-more-base-max-compact:transform-library-phone-song-more-transform " +
    "tw:library-song-more-base-max-compact:background-library-phone-more-background " +
    "tw:library-song-more-base-max-compact:text-library-phone-song-more-color " +
    "tw:library-song-more-hover:background-surface-overlay tw:library-song-more-hover:text-ink",
  "ds-library-empty-note":
    "tw:col-span-full tw:text-library-empty-note-color tw:p-library-empty-note-padding tw:list-none",
  "ds-library-sound-prompt":
    "tw:fixed tw:left-library-radius-round tw:top-library-sound-prompt-top tw:z-dialog tw:hidden tw:items-center " +
    "tw:gap-10 tw:p-library-sound-prompt-padding tw:border-0 tw:rounded-chip " +
    "tw:background-library-sound-prompt-background tw:text-library-sound-prompt-color " +
    "tw:font-library-sound-prompt-font tw:white-space-library-sound-prompt-white-space " +
    "tw:max-w-library-sound-prompt-max-width tw:shadow-library-sound-prompt-box-shadow " +
    "tw:transform-library-sound-prompt-transform tw:cursor-library-sound-prompt-cursor " +
    "tw:library-sound-prompt-show:inline-flex tw:library-sound-prompt-svg:w-library-sound-prompt-width " +
    "tw:library-sound-prompt-svg:h-library-sound-prompt-height",
  "ds-library-paper-list":
    "tw:grid tw:gap-10 tw:mt-library-radius-transcription-tile",
  "ds-library-paper-option":
    "tw:grid tw:grid-cols-library-paper-option-grid-template-columns tw:gap-library-radius-transcription-tile " +
    "tw:items-center tw:p-library-radius-menu tw:rounded-library-paper-option-border-radius " +
    "tw:border-library-paper-option-border tw:text-left tw:transition-library-paper-option-transition " +
    "tw:library-paper-option-hover:border-library-paper-option-hover-border-color " +
    "tw:library-paper-option-aria-checked-true:border-library-paper-option-aria-checked-true-border-color " +
    "tw:library-paper-option-aria-checked-true:background-library-paper-option-aria-checked-true-background " +
    "tw:library-paper-option-base-max-phone:grid-cols-1",
  "ds-library-paper-swatch":
    "tw:w-library-paper-swatch-width tw:h-library-paper-swatch-height tw:rounded-menu tw:block " +
    "tw:background-library-paper-swatch-background tw:overflow-clip tw:library-paper-swatch-base-max-phone:w-full",
  "ds-library-paper-text":
    "tw:grid tw:gap-library-focus-offset tw:text-library-paper-text-font-size " +
    "tw:leading-library-paper-text-line-height tw:text-library-paper-text-color " +
    "tw:library-paper-text-b:text-library-paper-text-b-color tw:library-paper-text-b:text-button",
  "ds-library-landing-aside":
    "tw:text-library-radius-transcription-tile",
  "ds-library-landing-empty":
    "tw:pt-library-landing-empty-padding-top tw:text-center " +
    "tw:border-0 tw:max-w-library-landing-empty-max-width tw:m-auto " +
    "tw:library-landing-empty-p-first-child:font-library-landing-empty-p-first-child-font " +
    "tw:library-landing-empty-btn:block tw:library-landing-empty-btn:m-library-landing-empty-btn-margin " +
    "tw:library-landing-empty-link-btn:block " +
    "tw:library-landing-empty-link-btn:m-library-landing-empty-link-btn-margin " +
    "tw:library-landing-empty-ds-library-link:block " +
    "tw:library-landing-empty-ds-library-link:m-library-landing-empty-link-btn-margin " +
    "tw:library-landing-empty-data-ds-button:block " +
    "tw:library-landing-empty-data-ds-button:m-library-landing-empty-btn-margin",
  "ds-library-search-input":
    "tw:font-inherit tw:color-inherit tw:p-library-search-input-padding",
  "ds-library-overlay":
    "tw:text-ink tw:font-inherit tw:outline-none tw:box-border tw:background-material-vellum-strong " +
    "tw:backdrop-filter-material-filter-strong tw:border-library-overlay-border tw:shadow-domain-sheet " +
    "tw:webkit-font-smoothing-inherit tw:webkit-locale-inherit tw:webkit-tap-highlight-color-inherit " +
    "tw:library-overlay-backdrop:background-library-overlay-backdrop " +
    "tw:library-overlay-base:webkit-font-smoothing-inherit tw:library-overlay-base:webkit-locale-inherit " +
    "tw:library-overlay-base:webkit-tap-highlight-color-inherit",
  "ds-library-overlay-content":
    "tw:block",
  "ds-library-prompt":
    "tw:m-auto tw:p-content tw:w-dialog tw:max-w-library-prompt-max tw:rounded-dialog tw:fixed tw:inset-0 tw:h-fit " +
    "tw:max-h-library-max-height-dialog tw:transition-library-prompt-transition tw:library-prompt-form-empty:hidden " +
    "tw:library-prompt-data-panel-state-entering:opacity-0 " +
    "tw:library-prompt-data-panel-state-entering:transform-library-prompt-enter " +
    "tw:library-prompt-data-panel-state-closing:opacity-0 " +
    "tw:library-prompt-data-panel-state-closing:transform-library-prompt-enter " +
    "tw:library-prompt-data-panel-state-open:opacity-100 tw:library-prompt-data-panel-state-open:transform-none",
  "ds-library-prompt-content":
    "tw:grid tw:gap-14 tw:webkit-font-smoothing-inherit tw:webkit-locale-inherit " +
    "tw:webkit-tap-highlight-color-inherit",
  "ds-library-prompt-title":
    "tw:m-0 tw:font-library-prompt-heading tw:wrap-anywhere " +
    "tw:library-prompt-title-root-data-type-revival:font-heading " +
    "tw:library-prompt-title-root-data-type-revival:font-regular " +
    "tw:library-prompt-title-root-data-type-revival:font-synthesis-none " +
    "tw:library-prompt-title-root-data-type-revival:uppercase " +
    "tw:library-prompt-title-root-data-type-revival:tracking-library-tracking-heading " +
    "tw:library-prompt-title-root-data-type-revival:text-dialog " +
    "tw:library-prompt-title-root-data-type-revival:leading-library-leading-dialog",
  "ds-library-prompt-body":
    "tw:m-0 tw:text-ink-secondary tw:select-text tw:webkit-font-smoothing-inherit tw:webkit-locale-inherit " +
    "tw:webkit-tap-highlight-color-inherit",
  "ds-library-prompt-actions":
    "tw:flex tw:justify-end tw:gap-10 tw:mt-6",
  "ds-library-popover":
    "tw:fixed tw:m-0 tw:min-w-library-popover-min tw:max-w-library-popover-max tw:p-8 tw:rounded-transcription-tile " +
    "tw:overflow-visible tw:transition-library-popover-transition tw:library-popover-backdrop:background-library-clear " +
    "tw:library-popover-data-panel-state-entering:opacity-0 " +
    "tw:library-popover-data-panel-state-entering:transform-library-popover-enter " +
    "tw:library-popover-data-panel-state-open:opacity-100 tw:library-popover-data-panel-state-open:transform-none " +
    "tw:library-popover-data-panel-state-closing:opacity-0",
  "ds-library-sheet":
    "tw:fixed tw:inset-library-sheet-inset tw:m-0 tw:w-full tw:max-width-none tw:max-h-library-max-height-sheet " +
    "tw:overflow-y-auto tw:p-library-sheet-padding tw:rounded-library-sheet-border-radius tw:border-0 " +
    "tw:border-top-library-sheet-border-top tw:library-sheet-base-min-panel:left-library-sheet-left " +
    "tw:library-sheet-base-min-panel:right-auto tw:library-sheet-base-min-panel:w-sheet " +
    "tw:library-sheet-base-min-panel:ml-library-sheet-offset tw:library-sheet-base-min-panel:bottom-content " +
    "tw:library-sheet-base-min-panel:rounded-transcription-dialog " +
    "tw:library-sheet-base-min-panel:border-library-sheet-border",
  "ds-library-sheet-head":
    "tw:relative tw:flex tw:items-center tw:justify-between tw:min-h-50 tw:pt-8",
  "ds-library-sheet-title":
    "tw:m-0 tw:text-section tw:font-strong",
  "ds-library-sheet-grab":
    "tw:absolute tw:top-0 tw:left-library-sheet-grab-left tw:w-40 tw:h-5 tw:ml-library-grab-offset " +
    "tw:rounded-admin-control tw:background-rule-strong",
  "ds-library-menu":
    "tw:grid",
  "ds-library-menu-item":
    "tw:flex tw:items-center tw:gap-control tw:min-h-44 tw:p-library-menu-item-padding tw:border-0 " +
    "tw:rounded-control tw:font-inherit tw:text-button tw:font-label tw:color-inherit tw:background-library-clear tw:text-left " +
    "tw:cursor-pointer tw:transition-library-menu-item-transition tw:library-menu-item-hover:outline-none " +
    "tw:library-menu-item-focus-visible:outline-none tw:library-menu-item-disabled:cursor-default " +
    "tw:library-menu-item-disabled:opacity-library-opacity-disabled tw:library-menu-item-ic:w-18 " +
    "tw:library-menu-item-ic:h-18 tw:library-menu-item-ic:text-ink-secondary " +
    "tw:library-menu-item-aria-checked-true-ds-library-menu-check:text-menu-check " +
    "tw:library-menu-item-ds-library-menu-chevron:w-16 tw:library-menu-item-ds-library-menu-chevron:h-16 " +
    "tw:library-menu-item-ds-library-menu-chevron:transition-library-menu-item-transition-phone " +
    "tw:library-menu-item-aria-expanded-true-ds-library-menu-chevron:transform-library-menu-item-transform",
  "ds-library-menu-check":
    "tw:ml-auto tw:text-ink-secondary tw:font-inherit tw:cursor-library-inherit tw:text-inherit tw:select-text " +
    "tw:webkit-font-smoothing-inherit tw:webkit-locale-inherit tw:webkit-tap-highlight-color-inherit",
  "ds-library-menu-value":
    "tw:ml-auto tw:text-ink-secondary tw:font-emphasis",
  "ds-library-menu-sub":
    "tw:grid",
  "ds-library-menu-option":
    "tw:min-h-40! tw:font-emphasis!",
  "ds-library-menu-danger":
    "tw:text-danger tw:library-menu-danger-ic:text-danger",
  "ds-library-offline-update":
    "tw:fixed tw:bottom-18 tw:right-18 tw:z-library-update-layer",
  "ds-library-link":
    "tw:min-h-0 tw:text-label tw:font-label tw:text-ink-secondary tw:p-library-link-padding tw:rounded-space-6 " +
    "tw:text-center tw:library-link-hover:text-ink tw:library-link-ds-library-landing-aside:text-body-small",
  "ds-library-tag":
    "tw:font-library-tag-font tw:tracking-library-tag-tracking tw:uppercase tw:text-ink-muted " +
    "tw:border-library-tag-border tw:rounded-chip tw:p-library-tag-padding",
  "ds-library-prompt-head":
    "tw:contents",
} as const;
export function libraryUtilityRecipe(hooks: string): string {
  return hooks.split(/\s+/).map(hook => hook + (hook in librarySlots ? " " + librarySlots[hook as keyof typeof librarySlots] : "")).join(" ");
}

export const libraryParts = [
  "sheet-grab",
  "song-grid",
  "cover",
  "song-body",
  "song-title",
  "song-meta",
  "vdots",
  "banner",
  "paper-list",
  "paper-swatch",
  "paper-text",
  "landing-empty",
  "landing-aside",
  "empty-note",
] as const;
export type LibraryPart = (typeof libraryParts)[number];
/** Retained library appearance, including the class hooks used by reorder and tours. */
export function libraryPartRecipe(part: LibraryPart) {
  return normalizeRecipe(libraryUtilityRecipe("ds-library-" + part + " " + part));
}

/** Expand only this domain's slots; adapters retain every historical behavior hook. */
export function libraryAccountUtilityRecipe<T>(value: T): T {
  if (typeof value === "string") {
    const classes = accountUtilityRecipe(libraryUtilityRecipe(value)).split(/\s+/);
    // The sheet owns its phone top rule and desktop frame independently of overlay material.
    return [...new Set(classes.filter(name => !value.includes("ds-library-sheet") || name !== "tw:border-library-overlay-border"))].join(" ") as T;
  }
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([slot, classes]) => [slot, libraryAccountUtilityRecipe(classes)])) as T;
  return value;
}
