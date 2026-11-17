import { normalizeRecipe } from "./normalize";
import { buttonRecipe, iconButtonRecipe } from "./controls";
/** D2: player chrome is a musical domain composition over shared controls.
 * Retain the separate phone footer, sheet mixer and theme materials pending owner decisions.
 * Unprefixed names are delegation/intro compatibility hooks, not appearance owners. */
const playerParts = {
  header: "ds-player-part ds-player-p-top p-top",
  title: "ds-player-part ds-player-p-title p-title",
  "header-actions": "ds-player-part ds-player-p-top-r p-top-r",
  "song-title": "ds-player-part ds-player-song-title song-title",
  "song-meta": "ds-player-part ds-player-song-meta song-meta",
  "voices-panel": "ds-player-part ds-player-voices-panel voices-panel",
  "panel-head": "ds-player-part ds-player-panel-head panel-head",
  label: "ds-player-part ds-player-label label",
  "voice-list": "ds-player-part ds-player-voice-list voice-list",
  "voice-row": "ds-player-part ds-player-voice-row voice-row",
  light: "ds-player-part ds-player-light light",
  chips: "ds-player-part ds-player-chips chips",
  "chips-mixer": "ds-player-part ds-player-chips-mixer chips-mixer",
  duck: "ds-player-part ds-player-duck duck",
  "duck-row": "ds-player-part ds-player-duck-row duck-row",
  "duck-value": "ds-player-part ds-player-duck-value duck-value",
  transport: "ds-player-part ds-player-transport transport",
  "transport-center": "ds-player-part ds-player-t-center t-center",
  "transport-right": "ds-player-part ds-player-t-right t-right",
  "transport-separator": "ds-player-part ds-player-t-sep t-sep",
  "info-indicator": "ds-player-part ds-player-info-metro info-metro",
  zoom: "ds-player-part ds-player-zoom zoom",
  "zoom-separator": "ds-player-part ds-player-zoom-sep zoom-sep",
  "zoom-value": "ds-player-part ds-player-zoom-value zoom-value",
  "mode-group": "ds-player-part ds-player-seg ds-player-mode-seg seg mode-seg",
  "view-group": "ds-player-part ds-player-seg ds-player-view-seg seg view-seg",
  "live-dot": "ds-player-part ds-player-live-dot live-dot",
  "mixer-body": "ds-player-part ds-player-sheet-body sheet-body",
  "switch-block":
    "ds-player-part ds-player-ctl-block ds-player-switch-row ctl-block switch-row",
  "switch-copy": "ds-player-part ds-player-switch-copy switch-copy",
  note: "ds-player-part ds-player-ctl-note ctl-note",
} as const;
export type PlayerPart = keyof typeof playerParts;
export function playerPartRecipe(part: PlayerPart) {
  return normalizeRecipe(playerUtilityClasses(playerParts[part]));
}
export function transportRecipe() {
  return {
    root: playerPartRecipe("transport"),
    center: playerPartRecipe("transport-center"),
    right: playerPartRecipe("transport-right"),
    play: buttonRecipe({ variant: "player-play" }),
    command: buttonRecipe({ variant: "player-transport" }),
    toggle: buttonRecipe({ variant: "player-toggle" }),
  };
}
export function voiceRowRecipe() {
  return {
    root: playerPartRecipe("voice-row"),
    light: playerPartRecipe("light"),
    name: buttonRecipe({ variant: "player-voice-name" }),
    mute: buttonRecipe({ variant: "player-mute" }),
    solo: buttonRecipe({ variant: "player-solo" }),
    more: iconButtonRecipe({ variant: "voice-more" }),
  };
}
export function voiceChipRecipe() {
  return buttonRecipe({ variant: "player-chip" });
}

/** Token-backed utility recipes. Retained hooks carry delegation and live player state. */
const playerUtilities: Readonly<Record<string, string>> = {
  "ds-player-part": [
    // .ds-player-part
    "tw:[:where(&)]:player-part-font tw:[:where(&)]:text-inherit tw:[:where(&)]:player-part--webkit-font-smoothing tw:[:where(&)]:player-part--webkit-locale tw:[:where(&)]:player-part--webkit-tap-highlight-color tw:[:where(&)]:select-text tw:[:where(&)]:[text-align:inherit]",
  ].join(" "),
  "ds-player-button": [
    // .ds-player-button
    "tw:[:where(&)]:player-part-font tw:[:where(&)]:text-inherit tw:[:where(&)]:player-part--webkit-font-smoothing tw:[:where(&)]:player-part--webkit-locale tw:[:where(&)]:player-part--webkit-tap-highlight-color tw:[:where(&)]:bg-none tw:[:where(&)]:border-0 tw:[:where(&)]:border-none tw:[:where(&)]:p-player-utility-button-padding tw:[:where(&)]:cursor-pointer tw:[:where(&)]:text-center tw:[:where(&)]:select-none",
    // .ds-player-button:disabled
    "tw:[:where(&):disabled]:cursor-default tw:[:where(&):disabled]:opacity-(--ds-opacity-disabled)",
    // .ds-player-button:focus-visible
    "tw:[:where(&):focus-visible]:player-button-outline tw:[:where(&):focus-visible]:outline-offset-space-2",
  ].join(" "),
  "ds-player-input": [
    // .ds-player-input
    "tw:[:where(&)]:player-part-font tw:[:where(&)]:text-inherit tw:[:where(&)]:player-part--webkit-font-smoothing tw:[:where(&)]:player-part--webkit-locale tw:[:where(&)]:player-part--webkit-tap-highlight-color",
    // .ds-player-input:focus-visible
    "tw:[:where(&):focus-visible]:player-input-outline tw:[:where(&):focus-visible]:outline-offset-space-2",
  ].join(" "),
  "ds-player-icon": [
    // .ds-player-icon
    "tw:w-player-utility-icon-width tw:h-player-utility-icon-width tw:rounded-radius-icon tw:inline-grid tw:place-items-center tw:text-ink-secondary tw:flex-none tw:player-icon-transition",
    // .ds-player-icon:hover
    "tw:[&:hover]:text-ink tw:[&:hover]:player-icon-background",
    // .ds-player-icon.ds-player-icon-small
    "tw:[&.ds-player-icon-small]:w-player-utility-icon-width-2 tw:[&.ds-player-icon-small]:h-player-utility-icon-width-2",
  ].join(" "),
  "ds-player-icon-small": [
    // .ds-player-icon-small .ic
    "tw:[&_.ic]:w-player-utility-icon-small-width tw:[&_.ic]:h-player-utility-icon-small-width",
  ].join(" "),
  "ds-player-reset": [
    // .ds-player-reset
    "tw:player-part-font tw:text-size-label tw:font-weight-label tw:text-ink-secondary tw:p-player-utility-reset-padding tw:rounded-space-6",
    // .ds-player-reset:hover
    "tw:[&:hover]:text-ink",
  ].join(" "),
  "ds-player-sheet-body": [
    // .ds-player-sheet-body
    "tw:block",
    // .ds-player-sheet-body .ds-player-voice-row:has(.ds-player-voice-more)
    "tw:[&_.ds-player-voice-row:has(.ds-player-voice-more)]:grid-cols-player-utility-sheet-body-grid-template-columns",
    // .ds-player-sheet-body .ds-player-voice-more
    "tw:[&_.ds-player-voice-row_.ds-player-voice-more]:w-player-utility-sheet-body-width tw:[&_.ds-player-voice-more]:opacity-100",
    // .ds-player-sheet-body .ds-player-voice-list
    "tw:[&_.ds-player-voice-list]:p-player-sheet-body-voice-list-padding-95",
    // .ds-player-sheet-body .ds-player-voice-row
    "tw:[&_.ds-player-voice-row]:min-h-player-utility-play-btn-width tw:[&_.ds-player-voice-row]:pl-player-sheet-body-voice-row-padding-left-96",
    // .ds-player-sheet-body .ds-player-mix-btn
    "tw:[&_.ds-player-mix-btn]:w-player-utility-icon-width tw:[&_.ds-player-mix-btn]:h-player-utility-icon-width",
    // .ds-player-sheet-body .ds-player-duck
    "tw:[&_.ds-player-duck]:p-player-sheet-body-duck-padding-97",
  ].join(" "),
  "ds-player-switch-copy": [
    // .ds-player-switch-copy
    "tw:inline",
  ].join(" "),
  "ds-player-glyph": [
    // .ds-player-glyph
    "tw:w-player-utility-native-width-18px tw:h-player-utility-glyph-height tw:block tw:relative tw:overflow-visible tw:font-font-music tw:text-size-button tw:leading-player-utility-button-padding tw:font-weight-body tw:text-ink-secondary tw:text-shadow-none",
    // .ds-player-glyph.treble
    "tw:[&.treble]:pt-player-utility-icon-small-width tw:[&.treble]:text-center",
    // .ds-player-glyph.treble8
    "tw:[&.treble8]:pt-player-utility-glyph-padding-top-2 tw:[&.treble8]:text-center",
    // .ds-player-glyph.bass
    "tw:[&.bass]:pt-player-utility-glyph-padding-top-3 tw:[&.bass]:text-center",
  ].join(" "),
  "ds-player-seg": [
    // .ds-player-seg
    "tw:inline-flex tw:p-player-seg-padding-1 tw:rounded-player-seg-border-radius-2 tw:player-seg-background tw:player-seg-border tw:backdrop-filter-(--ds-material-filter) tw:border-material-edge tw:player-shadow-shadow-material-highlight",
    // .ds-player-seg .ds-player-seg-item
    "tw:[&_.ds-player-seg-item]:inline-flex tw:[&_.ds-player-seg-item]:items-center tw:[&_.ds-player-seg-item]:gap-player-seg-button-gap-4 tw:[&_.ds-player-seg-item]:h-player-utility-icon-width-2 tw:[&_.ds-player-seg-item]:p-player-seg-button-padding-5 tw:[&_.ds-player-seg-item]:rounded-player-seg-button-border-radius-6 tw:[&_.ds-player-seg-item]:text-player-seg-button-font-size-7 tw:[&_.ds-player-seg-item]:font-player-seg-button-font-weight-8 tw:[&_.ds-player-seg-item]:text-ink-secondary tw:[&_.ds-player-seg-item]:whitespace-nowrap",
    // .ds-player-seg .ds-player-seg-item .ic
    "tw:[&_.ds-player-seg-item_.ic]:w-player-utility-seg-width tw:[&_.ds-player-seg-item_.ic]:h-player-utility-seg-width",
    // .ds-player-seg .ds-player-seg-item[aria-pressed="true"]
    "tw:[&_.ds-player-seg-item[aria-pressed='true']]:player-seg-background-2 tw:[&_.ds-player-seg-item[aria-pressed='true']]:text-ink tw:[&_.ds-player-seg-item[aria-pressed='true']]:player-shadow-player-seg-button-aria-pressed-true-box-shadow-113",
    // .lib-top .ds-player-seg .ds-player-seg-item span · (max-width: theme(--breakpoint-compact))
    "tw:max-compact:[.lib-top_&_.ds-player-seg-item_span]:hidden",
    // .ds-player-seg .ds-player-seg-item span · (width < theme(--breakpoint-panel))
    "tw:max-panel:[&_.ds-player-seg-item_span]:hidden",
    // .ds-player-seg .ds-player-seg-item · (width < theme(--breakpoint-panel))
    "tw:max-panel:[&_.ds-player-seg-item]:p-player-seg-button-padding-91",
    // .ds-player-seg · (prefers-reduced-transparency: reduce)
    "tw:player-reduced-transparency:backdrop-filter-none tw:player-reduced-transparency:player-pos-background",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-seg .ds-player-seg-item[aria-pressed="true"]
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_.ds-player-seg-item[aria-pressed='true']]:player-t-btn-background-3 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_.ds-player-seg-item[aria-pressed='true']]:border-transparent tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_.ds-player-seg-item[aria-pressed='true']]:player-shadow-shadow-emboss-pressed",
    // :root[data-theme="parchment"] .ds-player-seg .ds-player-seg-item[aria-pressed="true"]
    "tw:[:root[data-theme='parchment']_&_.ds-player-seg-item[aria-pressed='true']]:player-t-btn-background-4 tw:[:root[data-theme='parchment']_&_.ds-player-seg-item[aria-pressed='true']]:border-transparent tw:[:root[data-theme='parchment']_&_.ds-player-seg-item[aria-pressed='true']]:player-shadow-shadow-emboss-pressed",
  ].join(" "),
  "ds-player-live-dot": [
    // .ds-player-live-dot
    "tw:w-player-utility-live-dot-width tw:h-player-utility-live-dot-width tw:rounded-player-live-dot-border-radius-9 tw:player-live-dot-background tw:player-shadow-player-live-dot-box-shadow-10",
  ].join(" "),
  "ds-player-p-top": [
    // .ds-player-p-top
    "tw:player-p-top-grid-area tw:flex tw:items-center tw:gap-player-p-top-gap-11 tw:p-player-p-top-padding-12 tw:player-p-top-border-bottom tw:min-w-player-utility-button-padding tw:player-seg-background tw:backdrop-filter-none tw:player-shadow-player-p-top-box-shadow-111",
    // .ds-player-p-top · (width < theme(--breakpoint-panel))
    "tw:max-panel:p-player-p-top-padding-87 tw:max-panel:gap-player-back-btn-gap-14",
    // .ds-player-p-top .ds-player-seg
    "tw:[&_.ds-player-seg]:backdrop-filter-none",
    // .ds-player-p-top · (prefers-reduced-transparency: reduce)
    "tw:player-reduced-transparency:backdrop-filter-none tw:player-reduced-transparency:player-pos-background",
    // :root[data-theme="parchment"] .ds-player-p-top
    "tw:[:root[data-theme='parchment']_&]:player-shadow-player-p-top-box-shadow-166",
  ].join(" "),
  "ds-player-back-btn": [
    // .ds-player-back-btn
    "tw:inline-flex tw:items-center tw:gap-player-back-btn-gap-14 tw:h-player-utility-icon-width tw:p-player-back-btn-padding-15 tw:rounded-player-back-btn-border-radius-16 tw:text-ink-secondary tw:font-player-seg-button-font-weight-8 tw:text-player-back-btn-font-size-17 tw:flex-none",
    // .ds-player-back-btn:hover
    "tw:[&:hover]:player-icon-background tw:[&:hover]:text-ink",
    // .ds-player-back-btn · (width < theme(--breakpoint-panel))
    "tw:max-panel:p-player-back-btn-padding-88",
    // .ds-player-back-btn span · (width < theme(--breakpoint-panel))
    "tw:max-panel:[&_span]:hidden",
  ].join(" "),
  "ds-player-p-title": [
    // .ds-player-p-title
    "tw:flex tw:items-baseline tw:gap-player-p-title-gap-18 tw:min-w-player-utility-button-padding tw:flex-1",
    // .ds-player-p-title · (width < theme(--breakpoint-panel))
    "tw:max-panel:block tw:max-panel:pl-player-p-title-padding-left-89",
  ].join(" "),
  "ds-player-song-title": [
    // .ds-player-song-title
    "tw:m-player-utility-button-padding tw:player-song-title-font tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis tw:min-w-player-utility-button-padding",
    // .ds-player-song-title · (width < theme(--breakpoint-panel))
    "tw:max-panel:text-player-song-title-font-size-90 tw:max-panel:block",
    // :root[data-type="revival"] .ds-player-song-title
    "tw:[:root[data-type='revival']_&]:font-font-song-title tw:[:root[data-type='revival']_&]:font-player-song-title-font-weight-170 tw:[:root[data-type='revival']_&]:[font-synthesis:none] tw:[:root[data-type='revival']_&]:tracking-player-song-title-letter-spacing-171 tw:[:root[data-type='revival']_&]:text-player-song-title-font-size-172 tw:[:root[data-type='revival']_&]:leading-player-utility-song-title-line-height",
  ].join(" "),
  "ds-player-song-meta": [
    // .ds-player-song-meta
    "tw:text-player-song-meta-font-size-20 tw:text-ink-secondary tw:whitespace-nowrap",
    // .ds-player-song-meta · (width < theme(--breakpoint-panel))
    "tw:max-panel:hidden",
  ].join(" "),
  "ds-player-p-top-r": [
    // .ds-player-p-top-r
    "tw:flex tw:items-center tw:gap-player-p-top-r-gap-21 tw:flex-none",
    // .ds-player-p-top-r · (width < theme(--breakpoint-panel))
    "tw:max-panel:gap-player-back-btn-gap-14",
  ].join(" "),
  "ds-player-badge": [
    // .ds-player-badge
    "tw:inline-flex tw:items-center tw:gap-player-seg-button-gap-4 tw:h-player-utility-badge-height tw:p-player-seg-button-padding-5 tw:rounded-player-badge-border-radius-22 tw:player-badge-border tw:text-player-seg-button-font-size-7 tw:font-player-seg-button-font-weight-8",
    // .ds-player-badge .ic
    "tw:[&_.ic]:w-player-utility-seg-width tw:[&_.ic]:h-player-utility-seg-width",
    // .ds-player-badge:hover
    "tw:[&:hover]:border-ink-secondary",
    // .ds-player-badge span · (width < theme(--breakpoint-panel))
    "tw:max-panel:[&_span]:hidden",
    // .ds-player-badge · (width < theme(--breakpoint-panel))
    "tw:max-panel:p-player-seg-button-padding-91",
    // .ds-player-badge.is-leading
    "tw:[&.is-leading]:border-player-badge-is-leading-border-color-132 tw:[&.is-leading]:player-badge-background tw:[&.is-leading]:text-player-app-sing-along-badge-color-106 tw:[&.is-leading]:player-shadow-player-badge-is-leading-box-shadow-134",
    // .ds-player-badge .follow-pos
    "tw:[&_.follow-pos]:player-badge-font tw:[&_.follow-pos]:whitespace-nowrap",
    // #app.sing-along .ds-player-badge
    "tw:[#app.sing-along_&]:border-player-app-sing-along-badge-border-color-105 tw:[#app.sing-along_&]:text-player-app-sing-along-badge-color-106",
    // :root[data-theme="parchment"] .ds-player-badge.is-leading
    "tw:[:root[data-theme='parchment']_&.is-leading]:border-player-badge-is-leading-border-color-167 tw:[:root[data-theme='parchment']_&.is-leading]:text-player-badge-is-leading-color-168 tw:[:root[data-theme='parchment']_&.is-leading]:player-badge-background-2 tw:[:root[data-theme='parchment']_&.is-leading]:player-shadow-player-utility-badge-box-shadow-2",
    // :root[data-theme="parchment"] #app.sing-along .ds-player-badge
    "tw:[:root[data-theme='parchment']_#app.sing-along_&]:border-player-badge-is-leading-border-color-167 tw:[:root[data-theme='parchment']_#app.sing-along_&]:text-player-badge-is-leading-color-168 tw:[:root[data-theme='parchment']_#app.sing-along_&]:player-badge-background-2 tw:[:root[data-theme='parchment']_#app.sing-along_&]:player-shadow-player-utility-badge-box-shadow-2",
  ].join(" "),
  "ds-player-voices-panel": [
    // .ds-player-voices-panel
    "tw:player-voices-panel-grid-area tw:flex tw:flex-col tw:player-seg-background tw:player-voices-panel-border-right tw:min-h-player-utility-button-padding tw:backdrop-filter-none",
    // .ds-player-voices-panel · (width < theme(--breakpoint-panel))
    "tw:max-panel:hidden!",
    // .ds-player-voices-panel · (prefers-reduced-transparency: reduce)
    "tw:player-reduced-transparency:backdrop-filter-none tw:player-reduced-transparency:player-pos-background",
  ].join(" "),
  "ds-player-panel-head": [
    // .ds-player-panel-head
    "tw:flex tw:justify-between tw:items-center tw:p-player-panel-head-padding-25",
  ].join(" "),
  "ds-player-voice-list": [
    // .ds-player-voice-list
    "tw:list-none tw:m-player-utility-button-padding tw:p-player-voice-list-padding-26 tw:overflow-y-auto tw:flex-1",
  ].join(" "),
  "ds-player-voice-row": [
    // .ds-player-voice-row
    "tw:grid tw:grid-cols-player-utility-voice-row-grid-template-columns tw:gap-player-voice-row-gap-27 tw:items-center tw:min-h-player-utility-voice-row-min-height tw:p-player-voice-row-padding-28 tw:rounded-player-seg-border-radius-2 tw:player-voice-row-transition",
    // .ds-player-voice-row:has(.ds-player-voice-more)
    "tw:[&:has(.ds-player-voice-more)]:grid-cols-player-utility-voice-row-grid-template-columns-2",
    // .ds-player-voice-row:hover .ds-player-voice-more
    "tw:[&:hover_.ds-player-voice-more]:opacity-100",
    // .ds-player-voice-row:hover
    "tw:[&:hover]:player-voice-row-background",
    // .ds-player-voice-row.is-muted .ds-player-voice-name
    "tw:[&.is-muted_.ds-player-voice-name]:text-ink-muted",
    // .ds-player-voice-row.is-dimmed .ds-player-voice-name
    "tw:[&.is-dimmed_.ds-player-voice-name]:text-ink-muted",
    // .ds-player-voice-row.is-muted .ds-player-light
    "tw:[&.is-muted_.ds-player-light]:opacity-(--ds-player-voice-row-is-muted-light-opacity-31)",
    // :root[data-theme="parchment"] .ds-player-voice-row:hover
    "tw:[:root[data-theme='parchment']_&:hover]:player-voice-row-background-2",
  ].join(" "),
  "ds-player-voice-more": [
    // .ds-player-voice-more
    "tw:w-player-utility-voice-more-width tw:opacity-(--ds-player-voice-more-opacity-30)",
    // .ds-player-voice-more:focus-visible
    "tw:[&:focus-visible]:opacity-100",
  ].join(" "),
  "ds-player-light": [
    // .ds-player-light
    "tw:w-player-utility-light-width tw:h-player-utility-light-width tw:rounded-player-live-dot-border-radius-9 tw:player-light-border tw:opacity-(--ds-player-light-opacity-33) tw:player-light-transition",
    // .ds-player-light.on
    "tw:[&.on]:player-light-background tw:[&.on]:opacity-100 tw:[&.on]:player-light-box-shadow",
  ].join(" "),
  "ds-player-voice-name": [
    // .ds-player-voice-name
    "tw:text-left tw:font-player-seg-button-font-weight-8 tw:text-player-voice-name-font-size-37 tw:p-player-voice-name-padding-38 tw:rounded-player-seg-button-border-radius-6 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap",
    // .ds-player-voice-name.long
    "tw:[&.long]:line-clamp-2 tw:[&.long]:whitespace-normal tw:[&.long]:break-words tw:[&.long]:hyphens-auto tw:[&.long]:text-player-voice-name-long-font-size-39 tw:[&.long]:leading-player-utility-voice-name-line-height tw:[&.long]:p-player-voice-name-long-padding-40 tw:[&.long]:max-h-player-utility-voice-name-max-height tw:[&.long]:m-player-voice-name-long-margin-41",
  ].join(" "),
  "ds-player-mix-btn": [
    // .ds-player-mix-btn
    "tw:w-player-utility-icon-width-2 tw:h-player-utility-icon-width-2 tw:rounded-player-mix-btn-border-radius-42 tw:player-badge-border tw:player-mix-btn-font tw:text-ink-secondary tw:justify-self-center tw:player-mix-btn-transition",
    // .ds-player-mix-btn:hover
    "tw:[&:hover]:border-ink-secondary tw:[&:hover]:text-ink",
  ].join(" "),
  "ds-player-mute-btn": [
    // .ds-player-mute-btn[aria-pressed="true"]
    "tw:[&[aria-pressed='true']]:player-mute-btn-background tw:[&[aria-pressed='true']]:border-ink tw:[&[aria-pressed='true']]:text-surface-sunken tw:[&[aria-pressed='true']]:player-shadow-player-mute-btn-aria-pressed-true-box-shadow-130",
  ].join(" "),
  "ds-player-solo-btn": [
    // .ds-player-solo-btn[aria-pressed="true"]
    "tw:[&[aria-pressed='true']]:player-solo-btn-color tw:[&[aria-pressed='true']]:player-solo-btn-border-color tw:[&[aria-pressed='true']]:player-solo-btn-background tw:[&[aria-pressed='true']]:player-solo-btn-box-shadow",
  ].join(" "),
  "ds-player-duck": [
    // .ds-player-duck
    "tw:p-player-duck-padding-48 tw:player-duck-border-top",
  ].join(" "),
  "ds-player-duck-row": [
    // .ds-player-duck-row
    "tw:flex tw:items-center tw:gap-player-duck-row-gap-50 tw:mt-player-duck-row-margin-top-51",
  ].join(" "),
  "ds-player-duck-value": [
    // .ds-player-duck-value
    "tw:player-duck-value-font tw:text-ink-secondary tw:w-player-utility-icon-width tw:text-right",
  ].join(" "),
  "ds-player-volume": [
    // .ds-player-volume
    "tw:flex-1 tw:appearance-none tw:h-player-utility-volume-height tw:bg-none tw:m-space-2",
  ].join(" "),
  "ds-player-chips": [
    // .ds-player-chips
    "tw:player-chips-grid-area tw:hidden tw:gap-player-chips-gap-56 tw:items-center tw:p-player-chips-padding-57 tw:overflow-x-auto tw:[scrollbar-width:none]",
    // .ds-player-chips · (width < theme(--breakpoint-panel))
    "tw:max-panel:flex",
    // .ds-player-chips · (width < theme(--breakpoint-panel)) and (max-height: theme(--viewport-short-landscape-height)) and (orientation: landscape)
    "tw:player-short-landscape:hidden!",
    // #app.sing-along .ds-player-chips · (width < theme(--breakpoint-panel))
    "tw:max-panel:[#app.sing-along_&]:justify-center-safe tw:max-panel:[#app.sing-along_&]:gap-player-chips-gap-56 tw:max-panel:[#app.sing-along_&]:p-player-app-sing-along-chips-padding-107 tw:max-panel:[#app.sing-along_&]:player-duck-border-top",
    // #app.sing-along .ds-player-chips .ds-player-chip · (width < theme(--breakpoint-panel))
    "tw:max-panel:[#app.sing-along_&_.ds-player-chip]:h-player-utility-chips-height tw:max-panel:[#app.sing-along_&_.ds-player-chip]:p-player-app-sing-along-chips-chip-padding-108 tw:max-panel:[#app.sing-along_&_.ds-player-chip]:text-player-app-sing-along-chips-chip-font-size-109",
    // #app.sing-along .ds-player-chips
    "tw:[#app.sing-along_&]:player-seg-background tw:[#app.sing-along_&]:player-shadow-shadow-material-highlight",
    // #app.sing-along .ds-player-chips · (prefers-reduced-transparency: reduce)
    "tw:player-reduced-transparency:[#app.sing-along_&]:backdrop-filter-none tw:player-reduced-transparency:[#app.sing-along_&]:player-pos-background",
  ].join(" "),
  "ds-player-chip": [
    // .ds-player-chip
    "tw:inline-flex tw:items-center tw:gap-player-chips-gap-56 tw:h-player-utility-icon-width tw:p-player-chip-padding-58 tw:rounded-player-badge-border-radius-22 tw:player-chip-background tw:player-seg-border tw:font-player-seg-button-font-weight-8 tw:text-player-song-meta-font-size-20 tw:whitespace-nowrap tw:flex-none tw:player-chip-transition tw:border-material-edge tw:player-shadow-shadow-material-highlight",
    // .ds-player-chip i
    "tw:[&_i]:w-player-utility-glyph-padding-top-3 tw:[&_i]:h-player-utility-glyph-padding-top-3 tw:[&_i]:rounded-player-live-dot-border-radius-9 tw:[&_i]:player-light-background tw:[&_i]:player-chip-box-shadow-2",
    // .ds-player-chip.is-solo
    "tw:[&.is-solo]:player-solo-btn-border-color tw:[&.is-solo]:player-chip-background-3 tw:[&.is-solo]:player-chip-box-shadow-3",
    // .ds-player-chip.is-dimmed
    "tw:[&.is-dimmed]:text-ink-muted",
    // .ds-player-chip.is-muted
    "tw:[&.is-muted]:text-ink-muted tw:[&.is-muted]:line-through tw:[&.is-muted]:decoration-ink-muted",
    // .ds-player-chip.is-dimmed i
    "tw:[&.is-dimmed_i]:opacity-(--ds-player-chip-is-dimmed-i-opacity-62)",
    // .ds-player-chip.is-muted i
    "tw:[&.is-muted_i]:opacity-(--ds-player-chip-is-muted-i-opacity-63)",
    // .ds-player-chip · (prefers-reduced-transparency: reduce)
    "tw:player-reduced-transparency:backdrop-filter-none tw:player-reduced-transparency:player-pos-background",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-chip
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&]:rounded-player-seg-button-border-radius-6 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&]:player-chip-background-5 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&]:border-player-chip-border-color-138 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&]:player-shadow-player-chip-box-shadow-139",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-chip i
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_i]:w-player-utility-zoom-sep-height tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_i]:h-player-utility-chip-height-3 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_i]:rounded-player-chip-i-border-radius-140 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_i]:player-chip-background-6 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_i]:player-chip-box-shadow-5",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-chip.is-solo
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.is-solo]:player-chip-border-color-4 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.is-solo]:player-chip-background-7",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-chip.is-dimmed i
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.is-dimmed_i]:opacity-100 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.is-dimmed_i]:player-chip-background-8 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.is-dimmed_i]:player-shadow-player-chip-is-dimmed-i-box-shadow-146",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-chip.is-muted i
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.is-muted_i]:opacity-100 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.is-muted_i]:player-chip-background-9 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.is-muted_i]:player-shadow-player-chip-is-dimmed-i-box-shadow-146",
    // :root[data-theme="parchment"] .ds-player-chip
    "tw:[:root[data-theme='parchment']_&]:border-player-chip-border-color-157 tw:[:root[data-theme='parchment']_&]:player-shadow-player-chip-box-shadow-158",
    // :root[data-theme="parchment"] .ds-player-chip i
    "tw:[:root[data-theme='parchment']_&_i]:player-chip-background-10 tw:[:root[data-theme='parchment']_&_i]:player-chip-box-shadow-8",
    // :root[data-theme="parchment"] .ds-player-chip.is-solo
    "tw:[:root[data-theme='parchment']_&.is-solo]:player-chip-border-color-4 tw:[:root[data-theme='parchment']_&.is-solo]:player-chip-background-11",
    // :root[data-theme="parchment"] .ds-player-chip.is-dimmed i
    "tw:[:root[data-theme='parchment']_&.is-dimmed_i]:player-chip-background-12 tw:[:root[data-theme='parchment']_&.is-dimmed_i]:player-shadow-player-chip-is-dimmed-i-box-shadow-163",
    // :root[data-theme="parchment"] .ds-player-chip.is-muted i
    "tw:[:root[data-theme='parchment']_&.is-muted_i]:player-chip-background-13 tw:[:root[data-theme='parchment']_&.is-muted_i]:player-shadow-player-chip-is-dimmed-i-box-shadow-163",
  ].join(" "),
  "ds-player-chips-mixer": [
    // .ds-player-chips-mixer
    "tw:player-chips-mixer-grid-area tw:hidden tw:justify-self-end tw:items-center tw:p-player-chips-mixer-padding-64 tw:player-chips-mixer-background tw:z-(--ds-player-utility-chips-mixer-z-index)",
    // .ds-player-chips-mixer · (width < theme(--breakpoint-panel))
    "tw:max-panel:flex",
    // .ds-player-chips-mixer · (width < theme(--breakpoint-panel)) and (max-height: theme(--viewport-short-landscape-height)) and (orientation: landscape)
    "tw:player-short-landscape:hidden!",
    // #app.sing-along .ds-player-chips-mixer · (width < theme(--breakpoint-panel))
    "tw:max-panel:[#app.sing-along_&]:self-start tw:max-panel:[#app.sing-along_&]:p-player-app-sing-along-chips-mixer-padding-110 tw:max-panel:[#app.sing-along_&]:bg-none",
    // :root[data-theme="parchment"] .ds-player-chips-mixer
    "tw:[:root[data-theme='parchment']_&]:player-chips-mixer-background-3",
  ].join(" "),
  "ds-player-mixer-chip": [
    // .ds-player-mixer-chip
    "tw:p-player-mixer-chip-padding-66 tw:player-mixer-chip-background",
    // .ds-player-mixer-chip .ic
    "tw:[&_.ic]:w-player-utility-native-width-18px tw:[&_.ic]:h-player-utility-native-width-18px",
    // :root[data-theme="parchment"] .ds-player-mixer-chip
    "tw:[:root[data-theme='parchment']_&]:player-chip-background-5",
  ].join(" "),
  "ds-player-zoom": [
    // .ds-player-zoom
    "tw:absolute tw:right-player-utility-zoom-right tw:bottom-player-utility-zoom-right tw:flex tw:items-center tw:gap-player-zoom-gap-67 tw:p-player-seg-padding-1 tw:rounded-player-zoom-border-radius-68 tw:player-zoom-background tw:player-seg-border tw:player-zoom-font tw:text-ink-secondary tw:backdrop-filter-none tw:border-material-edge tw:player-shadow-shadow-material-highlight",
    // .ds-player-zoom .icon-btn
    "tw:[&_.icon-btn]:w-player-utility-icon-width-2 tw:[&_.icon-btn]:h-player-utility-icon-width-2",
    // .ds-player-zoom .ic
    "tw:[&_.ic]:w-player-utility-seg-width tw:[&_.ic]:h-player-utility-seg-width",
    // .ds-player-zoom · (width < theme(--breakpoint-panel))
    "tw:max-panel:hidden!",
    // #app.sing-along .ds-player-zoom
    "tw:[#app.sing-along_&]:hidden!",
    // .ds-player-zoom .ds-player-follow-btn[aria-pressed="true"]
    "tw:[&_.ds-player-follow-btn[aria-pressed='true']]:text-ink tw:[&_.ds-player-follow-btn[aria-pressed='true']]:player-t-btn-background-2 tw:[&_.ds-player-follow-btn[aria-pressed='true']]:player-shadow-player-zoom-follow-btn-aria-pressed-true-box-shadow-121",
    // .ds-player-zoom .ds-player-follow-btn[aria-pressed="true"] .ic
    "tw:[&_.ds-player-follow-btn[aria-pressed='true']_.ic]:filter-(--ds-player-zoom-follow-btn-aria-pressed-true-ic-filter-122)",
    // .ds-player-zoom · (prefers-reduced-transparency: reduce)
    "tw:player-reduced-transparency:backdrop-filter-none tw:player-reduced-transparency:player-pos-background",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-zoom .ds-player-follow-btn[aria-pressed="true"]
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_.ds-player-follow-btn[aria-pressed='true']]:player-t-btn-background-3 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_.ds-player-follow-btn[aria-pressed='true']]:border-transparent tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_.ds-player-follow-btn[aria-pressed='true']]:player-shadow-shadow-emboss-pressed",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-zoom .ds-player-follow-btn[aria-pressed="true"] .ic
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_.ds-player-follow-btn[aria-pressed='true']_.ic]:filter-none",
    // :root[data-theme="parchment"] .ds-player-zoom .ds-player-follow-btn[aria-pressed="true"]
    "tw:[:root[data-theme='parchment']_&_.ds-player-follow-btn[aria-pressed='true']]:player-t-btn-background-4 tw:[:root[data-theme='parchment']_&_.ds-player-follow-btn[aria-pressed='true']]:border-transparent tw:[:root[data-theme='parchment']_&_.ds-player-follow-btn[aria-pressed='true']]:player-shadow-shadow-emboss-pressed",
    // :root[data-theme="parchment"] .ds-player-zoom
    "tw:[:root[data-theme='parchment']_&]:player-zoom-background-6",
  ].join(" "),
  "ds-player-zoom-value": [
    // .ds-player-zoom-value
    "tw:min-w-player-utility-zoom-value-min-width tw:text-center",
  ].join(" "),
  "ds-player-info-row": [
    // .ds-player-info-row
    "tw:player-info-row-grid-area tw:hidden tw:items-center tw:justify-between tw:gap-player-chips-gap-56 tw:p-player-info-row-padding-71 tw:player-duck-value-font tw:text-ink-secondary tw:player-duck-border-top tw:player-seg-background tw:backdrop-filter-none tw:player-shadow-shadow-material-highlight",
    // .ds-player-info-row b
    "tw:[&_b]:text-ink tw:[&_b]:font-player-seg-button-font-weight-8",
    // .ds-player-info-row > span
    "tw:[&_>_span]:inline-flex tw:[&_>_span]:items-center tw:[&_>_span]:gap-player-back-btn-gap-14 tw:[&_>_span]:whitespace-nowrap",
    // .ds-player-info-row .ic
    "tw:[&_.ic]:w-player-utility-seg-width tw:[&_.ic]:h-player-utility-seg-width",
    // .ds-player-info-row · (width < theme(--breakpoint-panel))
    "tw:max-panel:flex",
    // .following .ds-player-info-row
    "tw:[.following_&]:opacity-(--ds-player-following-transport-t-center-opacity-103)",
    // #app.sing-along .ds-player-info-row
    "tw:[#app.sing-along_&]:hidden!",
    // .ds-player-info-row · (prefers-reduced-transparency: reduce)
    "tw:player-reduced-transparency:backdrop-filter-none tw:player-reduced-transparency:player-pos-background",
  ].join(" "),
  "ds-player-info-metro": [
    // .ds-player-info-metro
    "tw:opacity-(--ds-player-info-metro-opacity-72)",
    // .ds-player-info-metro.on
    "tw:[&.on]:opacity-100 tw:[&.on]:text-ink",
    // .ds-player-info-metro.on .ic
    "tw:[&.on_.ic]:filter-(--ds-player-zoom-follow-btn-aria-pressed-true-ic-filter-122)",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-info-metro.on .ic
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.on_.ic]:filter-none",
  ].join(" "),
  "ds-player-transport": [
    // .ds-player-transport
    "tw:player-transport-grid-area tw:grid tw:grid-cols-player-utility-transport-grid-template-columns tw:items-center tw:player-seg-background tw:player-duck-border-top tw:pr-player-transport-padding-right-73 tw:backdrop-filter-none tw:player-shadow-shadow-material-highlight",
    // .ds-player-transport .ds-player-pos · (width < theme(--breakpoint-panel))
    "tw:max-panel:[&_.ds-player-pos]:hidden!",
    // .ds-player-transport · (width < theme(--breakpoint-panel))
    "tw:max-panel:grid-cols-player-utility-transport-grid-template-columns-2 tw:max-panel:p-player-transport-padding-92",
    // .ds-player-transport · (width < theme(--breakpoint-panel)) and (max-height: theme(--viewport-short-landscape-height)) and (orientation: landscape)
    "tw:player-short-landscape:pt-player-transport-padding-top-93 tw:player-short-landscape:pb-player-transport-padding-bottom-94",
    // .following .ds-player-transport .ds-player-t-center
    "tw:[.following_&_.ds-player-t-center]:opacity-(--ds-player-following-transport-t-center-opacity-103)",
    // .following .ds-player-transport .ds-player-t-right
    "tw:[.following_&_.ds-player-t-right]:opacity-(--ds-player-following-transport-t-center-opacity-103)",
    // .following .ds-player-transport .ds-player-pos
    "tw:[.following_&_.ds-player-pos]:opacity-(--ds-player-following-transport-t-center-opacity-103)",
    // #app.sing-along .ds-player-transport
    "tw:[#app.sing-along_&]:hidden!",
    // .ds-player-transport · (prefers-reduced-transparency: reduce)
    "tw:player-reduced-transparency:backdrop-filter-none tw:player-reduced-transparency:player-pos-background",
  ].join(" "),
  "ds-player-pos": [
    // .ds-player-pos
    "tw:grid tw:gap-player-pos-gap-74 tw:justify-items-start tw:p-player-pos-padding-75 tw:ml-player-pos-margin-left-76 tw:rounded-player-back-btn-border-radius-16 tw:text-left",
    // .ds-player-pos:hover
    "tw:[&:hover]:player-pos-background",
    // .ds-player-pos b
    "tw:[&_b]:player-pos-font tw:[&_b]:whitespace-nowrap",
    // .ds-player-pos span
    "tw:[&_span]:player-pos-font-2 tw:[&_span]:text-ink-secondary tw:[&_span]:whitespace-nowrap",
  ].join(" "),
  "ds-player-t-center": [
    // .ds-player-t-center
    "tw:flex tw:items-center tw:justify-center tw:gap-player-chips-gap-56",
    // .ds-player-t-center · (width < theme(--breakpoint-panel))
    "tw:max-panel:justify-between",
  ].join(" "),
  "ds-player-t-btn": [
    // .ds-player-t-btn
    "tw:w-player-utility-t-btn-width tw:h-player-utility-t-btn-width tw:rounded-player-seg-border-radius-2 tw:grid tw:place-items-center tw:text-ink-secondary tw:player-t-btn-border tw:player-t-btn-transition tw:touch-manipulation tw:select-none",
    // .ds-player-t-btn:hover
    "tw:[&:hover]:text-ink tw:[&:hover]:player-pos-background",
    // .ds-player-t-btn .ic
    "tw:[&_.ic]:w-player-utility-volume-height tw:[&_.ic]:h-player-utility-volume-height",
    // .ds-player-t-btn.ds-player-toggle[aria-pressed="true"]
    "tw:[&.ds-player-toggle[aria-pressed='true']]:player-t-btn-background-2 tw:[&.ds-player-toggle[aria-pressed='true']]:text-ink tw:[&.ds-player-toggle[aria-pressed='true']]:player-t-btn-border-color tw:[&.ds-player-toggle[aria-pressed='true']]:player-shadow-player-t-btn-toggle-aria-pressed-true-box-shadow-128",
    // .ds-player-t-btn · (width < theme(--breakpoint-panel))
    "tw:max-panel:w-player-utility-t-btn-width-3 tw:max-panel:h-player-utility-t-btn-width-3",
    // .ds-player-t-btn · (width < theme(--breakpoint-panel)) and (max-height: theme(--viewport-short-landscape-height)) and (orientation: landscape)
    "tw:player-short-landscape:w-player-utility-zoom-value-min-width tw:player-short-landscape:h-player-utility-zoom-value-min-width",
    // .ds-player-t-btn.ds-player-toggle[aria-pressed="true"] .ic
    "tw:[&.ds-player-toggle[aria-pressed='true']_.ic]:filter-(--ds-player-zoom-follow-btn-aria-pressed-true-ic-filter-122)",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-t-btn.ds-player-toggle[aria-pressed="true"]
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.ds-player-toggle[aria-pressed='true']]:player-t-btn-background-3 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.ds-player-toggle[aria-pressed='true']]:border-transparent tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.ds-player-toggle[aria-pressed='true']]:player-shadow-shadow-emboss-pressed",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-t-btn.ds-player-toggle[aria-pressed="true"] .ic
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&.ds-player-toggle[aria-pressed='true']_.ic]:filter-none",
    // :root[data-theme="parchment"] .ds-player-t-btn.ds-player-toggle[aria-pressed="true"]
    "tw:[:root[data-theme='parchment']_&.ds-player-toggle[aria-pressed='true']]:player-t-btn-background-4 tw:[:root[data-theme='parchment']_&.ds-player-toggle[aria-pressed='true']]:border-transparent tw:[:root[data-theme='parchment']_&.ds-player-toggle[aria-pressed='true']]:player-shadow-shadow-emboss-pressed",
  ].join(" "),
  "ds-player-t-stop-left": [
    // .ds-player-t-stop-left
    "tw:hidden",
    // .ds-player-t-stop-left · (width < theme(--breakpoint-panel))
    "tw:max-panel:grid",
  ].join(" "),
  "ds-player-t-sep": [
    // .ds-player-t-sep
    "tw:w-player-utility-t-sep-width tw:h-player-utility-glyph-height tw:player-t-sep-background tw:m-player-t-sep-margin-81",
    // .ds-player-t-sep · (width < theme(--breakpoint-panel))
    "tw:max-panel:hidden!",
  ].join(" "),
  "ds-player-play-btn": [
    // .ds-player-play-btn
    "tw:w-player-utility-play-btn-width tw:h-player-utility-play-btn-width tw:rounded-player-live-dot-border-radius-9 tw:player-play-btn-background tw:text-player-play-btn-color-123 tw:grid tw:place-items-center tw:player-shadow-player-play-btn-box-shadow-125 tw:player-play-btn-transition tw:flex-none",
    // .ds-player-play-btn:hover
    "tw:[&:hover]:player-shadow-player-play-btn-hover-box-shadow-126",
    // .ds-player-play-btn:active
    "tw:[&:active]:transform-(--ds-player-play-btn-active-transform-85)",
    // .ds-player-play-btn .ic
    "tw:[&_.ic]:w-player-utility-glyph-height tw:[&_.ic]:h-player-utility-glyph-height",
    // .ds-player-play-btn:not(.playing) .ic
    "tw:[&:not(.playing)_.ic]:ml-player-play-btn-not-playing-ic-margin-left-86",
    // .ds-player-play-btn · (width < theme(--breakpoint-panel))
    "tw:max-panel:w-player-utility-play-btn-width-3 tw:max-panel:h-player-utility-play-btn-width-3",
    // .ds-player-play-btn .ic · (width < theme(--breakpoint-panel))
    "tw:max-panel:[&_.ic]:w-player-utility-voice-more-width tw:max-panel:[&_.ic]:h-player-utility-voice-more-width",
    // .ds-player-play-btn · (width < theme(--breakpoint-panel)) and (max-height: theme(--viewport-short-landscape-height)) and (orientation: landscape)
    "tw:player-short-landscape:w-player-utility-t-btn-width-3 tw:player-short-landscape:h-player-utility-t-btn-width-3",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-play-btn
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&]:text-ink tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&]:player-play-btn-background-2 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&]:player-shadow-shadow-emboss-raised",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-play-btn:hover
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&:hover]:text-ink tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&:hover]:player-play-btn-background-2 tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&:hover]:player-shadow-shadow-emboss-raised",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-play-btn:active
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&:active]:player-shadow-shadow-emboss-pressed",
    // :root:is([data-theme="night-paper"], [data-theme="parchment"]) .ds-player-play-btn .ic
    "tw:[:root:is([data-theme='night-paper'],_[data-theme='parchment'])_&_.ic]:filter-(--ds-player-play-btn-ic-filter-136)",
    // :root[data-theme="parchment"] .ds-player-play-btn
    "tw:[:root[data-theme='parchment']_&]:text-ink tw:[:root[data-theme='parchment']_&]:player-play-btn-background-3 tw:[:root[data-theme='parchment']_&]:player-shadow-shadow-emboss-raised",
    // :root[data-theme="parchment"] .ds-player-play-btn:hover
    "tw:[:root[data-theme='parchment']_&:hover]:text-ink tw:[:root[data-theme='parchment']_&:hover]:player-play-btn-background-3 tw:[:root[data-theme='parchment']_&:hover]:player-shadow-shadow-emboss-raised",
    // :root[data-theme="parchment"] .ds-player-play-btn:active
    "tw:[:root[data-theme='parchment']_&:active]:player-shadow-shadow-emboss-pressed",
    // :root[data-theme="parchment"] .ds-player-play-btn .ic
    "tw:[:root[data-theme='parchment']_&_.ic]:filter-(--ds-player-play-btn-ic-filter-152)",
  ].join(" "),
  "ds-player-t-right": [
    // .ds-player-t-right
    "tw:flex tw:items-center tw:gap-player-p-top-r-gap-21",
    // .ds-player-t-right · (width < theme(--breakpoint-panel))
    "tw:max-panel:hidden!",
  ].join(" "),
  "ds-player-landscape-only": [
    // .ds-player-landscape-only
    "tw:hidden!",
    // .ds-player-landscape-only · (width < theme(--breakpoint-panel)) and (max-height: theme(--viewport-short-landscape-height)) and (orientation: landscape)
    "tw:player-short-landscape:inline-grid!",
  ].join(" "),
  "ds-player-t-metro": [
    // .ds-player-t-metro · (width < theme(--breakpoint-panel))
    "tw:max-panel:hidden!",
  ].join(" "),
  "ds-player-t-stop-mid": [
    // .ds-player-t-stop-mid · (width < theme(--breakpoint-panel))
    "tw:max-panel:hidden!",
  ].join(" "),
  "ds-player-switch-row": [
    // .ds-player-switch-row
    "tw:flex tw:items-center tw:justify-between tw:gap-player-switch-row-gap-98",
    // .ds-player-switch-row b
    "tw:[&_b]:block tw:[&_b]:mb-player-switch-row-b-margin-bottom-99",
  ].join(" "),
  "ds-player-switch": [
    // .ds-player-switch
    "tw:relative tw:w-player-utility-switch-width tw:h-player-utility-icon-width-2 tw:rounded-player-badge-border-radius-22 tw:player-switch-background tw:flex-none tw:player-switch-transition",
    // The generated thumb uses the same token-backed utility surface as the track.
    "tw:after:content-(--ds-content-empty) tw:after:absolute tw:after:left-4 tw:after:top-4 tw:after:size-24 tw:after:rounded-player-live-dot-border-radius-9 tw:after:bg-ink-secondary tw:after:player-switch-thumb-transition tw:aria-checked:after:transform-(--ds-player-switch-aria-checked-true-after-transform-102) tw:aria-checked:after:bg-surface-sunken",
    // .ds-player-switch[aria-checked="true"]
    "tw:[&[aria-checked='true']]:player-mute-btn-background",
  ].join(" "),
  "ds-player-zoom-sep": [
    // .ds-player-zoom-sep
    "tw:w-player-utility-t-sep-width tw:h-player-utility-zoom-sep-height tw:m-player-zoom-sep-margin-119 tw:player-t-sep-background",
  ].join(" "),
  "ds-player-label": [
    // .ds-player-label
    "tw:player-label-font tw:tracking-player-label-letter-spacing-149 tw:uppercase tw:text-ink-muted",
  ].join(" "),
  "ds-player-ctl-block": [
    // .ds-player-ctl-block
    "tw:p-player-ctl-block-padding-150 tw:player-duck-border-top",
  ].join(" "),
  "ds-player-ctl-note": [
    // .ds-player-ctl-note
    "tw:block tw:text-player-voice-name-long-font-size-39 tw:text-ink-secondary",
  ].join(" "),
};

/** Shared controls and domain adapters use this same player utility vocabulary. */
export function playerUtilityClasses(hooks: string): string {
  const classes = [hooks, ...hooks.split(/\s+/).map(hook => playerUtilities[hook] ?? "")]
    .join(" ").split(/\s+/).filter(Boolean);
  const slots = new Map<string, string>();
  for (const cls of classes) {
    const colon = cls.lastIndexOf(":");
    const variant = cls.slice(0, colon + 1);
    const utility = cls.slice(colon + 1);
    const property = /^(max-h|min-h|max-w|min-w|h|w|bg|leading|opacity)-/.exec(utility)?.[1]
      ?? (/^(block|inline-block|flex|inline-flex|grid|inline-grid|hidden)$/.test(utility) ? "display" : undefined);
    // A more specific named hook replaces the same base property, e.g. stop-left's display.
    slots.set(property ? variant + property : cls, cls);
  }
  return [...slots.values()].join(" ");
}

export function playerGlyphRecipe(kind: string): string {
  return playerUtilityClasses("ds-player-glyph menu-glyph " + kind);
}
