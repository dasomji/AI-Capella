/** Named structural recipes. Values come from semantic roles; hooks remain available to behavior.
 * These native containers inherit their typography; controls use the normalized shared primitives. */

export function appShellRecipe() {
  return {
    root: "tw:h-app-height tw:w-full tw:overflow-hidden tw:motion-app-transition tw:[&.arriving]:opacity-hidden tw:[&.arriving]:pointer-events-none tw:[&.arriving]:[transition:none] tw:relative tw:z-app-z-index",
    view: "view tw:hidden tw:h-full",
    landing: "tw:[#app.mode-landing_&]:flex tw:relative tw:select-none tw:select-none tw:touch-callout-none tw:flex-col tw:items-center tw:justify-center tw:gap-landing-gap tw:p-landing-padding tw:overflow-hidden tw:[:root[data-title='zeile']_&]:gap-landing-gap-written tw:[:root[data-title='zeile']_&]:pb-landing-padding-bottom tw:[:root[data-title='buehne']_&]:gap-landing-gap-written tw:[:root[data-title='buehne']_&]:pb-landing-padding-bottom",
    library: "tw:[#app.mode-library_&]:flex tw:relative tw:flex-col",
    player: "tw:[#app.mode-player_&]:grid",
    overview: "overview tw:reduced-transparency:[-webkit-backdrop-filter:none] tw:reduced-transparency:[backdrop-filter:none] tw:reduced-transparency:surface-surface-raised",
    stage: "stage tw:surface-material-stage-background",
    layer: "stage-layer tw:absolute tw:inset-none tw:w-full tw:h-full tw:pointer-events-none tw:opacity-hidden tw:will-change-opacity",
  } as const;
}

export function brandRecipe() {
  return {
    wordmark: "wordmark tw:type-wordmark-font tw:tracking-wordmark-letter-spacing tw:whitespace-nowrap tw:[&[aria-label='LightScore']]:surface-material-wordmark-aria-label-lightscore-background tw:[&[aria-label='LightScore']]:[-webkit-background-clip:var(--ds-material-wordmark-aria-label-lightscore-vendor-background-clip)] tw:[&[aria-label='LightScore']]:[background-clip:var(--ds-material-wordmark-aria-label-lightscore-background-clip)] tw:[&[aria-label='LightScore']]:text-transparent tw:[font-family:var(--ds-type-wordmark-font-family)] tw:[font-weight:var(--ds-type-wordmark-font-weight)] tw:[font-synthesis:var(--ds-type-wordmark-font-synthesis)]",
    script: "ls-l tw:surface-clear tw:bg-clip-border tw:bg-clip-border tw:type-title-l-font tw:tracking-(--ds-tracking-zero) tw:mr-title-l-margin-right tw:text-material-title-l-color tw:[text-shadow:var(--ds-material-title-l-text-shadow)]",
    group: "brand tw:inline-flex tw:items-center tw:gap-inline tw:min-w-none",
    mark: "mark tw:w-heading tw:h-heading tw:flex-none",
    ribbons: "ribbons tw:absolute tw:inset-none tw:w-full tw:h-full tw:pointer-events-none",
  } as const;
}

export function landingRecipe() {
  return {
    name: "landing-name tw:relative tw:m-none tw:type-landing-name-font tw:tracking-landing-name-letter-spacing tw:text-center tw:animate-landing-name-animation tw:[:root[data-start='neu']_&]:[line-height:0] tw:[:root[data-start='neu']_&_.ink]:block tw:[:root[data-start='neu']_&_.ink]:absolute tw:[:root[data-start='neu']_&_.ink]:[filter:var(--ds-material-landing-name-ink-filter)] tw:[:root[data-start='neu']_&_.ink]:animate-landing-name-ink-animation tw:[:root[data-start='neu']_&_.ink]:[-webkit-mask-image:linear-gradient(var(--ds-writing-mask-angle),_var(--ds-writing-mask-ink)_calc(var(--written)_-_var(--ds-writing-mask-feather)),_transparent_var(--written))] tw:[:root[data-start='neu']_&_.ink]:[mask-image:linear-gradient(var(--ds-writing-mask-angle),_var(--ds-writing-mask-ink)_calc(var(--written)_-_var(--ds-writing-mask-feather)),_transparent_var(--written))] tw:motion-safe:[:root[data-start='neu']_&_.ink]:animate-landing-name-ink-animation-write tw:motion-reduce:[:root[data-start='neu']_&_.ink]:animate-none tw:motion-safe:[:root[data-start='neu']_&_.ls-score]:animate-none tw:motion-safe:[:root[data-start='neu']_&_.ls-score]:opacity-hidden tw:motion-safe:[:root[data-start='neu']_&_.ls-name.score-in_.ls-score]:animate-landing-name-title-name-score-in-title-score-animation tw:motion-safe:[:root[data-start='neu']_&_.ls-name.score-aside_.ls-score]:motion-landing-name-title-name-score-aside-title-score-transition tw:[:root[data-title='zeile']_&]:animate-none tw:[:root[data-title='zeile']_&_.ls-score]:opacity-hidden tw:[:root[data-title='zeile']_&_.ls-score]:[filter:var(--ds-landing-name-title-score-filter)] tw:[:root[data-title='zeile']_&_.ls-name.score-in_.ls-score]:animate-landing-name-title-name-score-in-title-score-animation-staff tw:motion-reduce:[:root[data-title='zeile']_&_.ls-score]:opacity-visible tw:[:root[data-title='buehne']_&]:animate-none tw:[:root[data-title='buehne']_&_.ls-score]:opacity-hidden tw:[:root[data-title='buehne']_&_.ls-score]:[filter:var(--ds-landing-name-title-score-filter-stage)] tw:[:root[data-title='buehne']_&_.ls-score]:motion-landing-name-title-score-transition tw:[:root[data-title='buehne']_&_.ls-name.score-in_.ls-score]:animate-landing-name-title-name-score-in-title-score-animation-stage tw:[:root[data-title='buehne']_&_.ls-name.lit_.ls-score]:[filter:var(--ds-landing-name-title-name-lit-title-score-filter)] tw:motion-reduce:[:root[data-title='buehne']_&_.ls-score]:opacity-visible",
    modes: "landing-modes tw:relative tw:flex tw:gap-control tw:flex-wrap tw:justify-center tw:animate-landing-modes-animation tw:max-phone-wide-inclusive:flex-col tw:max-phone-wide-inclusive:w-full tw:max-phone-wide-inclusive:max-w-landing-modes-max-width tw:[:root[data-title='zeile']_&]:[animation-delay:var(--ds-landing-modes-animation-delay)] tw:[:root[data-title='buehne']_&]:[animation-delay:var(--ds-landing-modes-animation-delay-stage)]",
    choice: "landing-choice tw:relative tw:flex tw:flex-col tw:items-center tw:gap-content tw:w-full tw:[.no-ensemble_&]:items-center tw:[.no-ensemble_&]:text-center",
    dedication: "landing-dedication tw:m-landing-dedication-margin tw:flex tw:items-baseline tw:justify-center tw:flex-wrap tw:gap-x-landing-dedication-column-gap tw:type-landing-dedication-font tw:[animation:rise_var(--ds-duration-dedication-enter)_var(--ded-delay,_var(--ded-wait))_var(--ds-ease-standard)_both] tw:motion-safe:[&.written_.ded-name]:[animation:ink-write_var(--ds-duration-dedication-write)_var(--ds-ease-writing)_calc(var(--ded-delay,_var(--ded-wait))_+_var(--ds-delay-dedication-write))_both]",
    dedicationName: "ded-name tw:inline-block tw:p-ded-name-padding tw:surface-material-ded-name-background tw:[-webkit-background-clip:var(--ds-material-ded-name-vendor-background-clip)] tw:[background-clip:var(--ds-material-ded-name-background-clip)] tw:text-transparent tw:[filter:var(--ds-material-ded-name-filter)] tw:[-webkit-mask-image:linear-gradient(var(--ds-writing-mask-angle),_var(--ds-writing-mask-ink)_calc(var(--written)_-_var(--ds-writing-mask-feather)),_transparent_var(--written))] tw:[mask-image:linear-gradient(var(--ds-writing-mask-angle),_var(--ds-writing-mask-ink)_calc(var(--written)_-_var(--ds-writing-mask-feather)),_transparent_var(--written))] tw:motion-reduce:[-webkit-mask-image:none] tw:motion-reduce:[mask-image:none]",
  } as const;
}

export function libraryHeaderRecipe() {
  return {
    root: "lib-top tw:flex tw:items-center tw:justify-between tw:gap-control tw:h-stage tw:p-library-top-padding tw:frame-bottom-library-top-border-bottom tw:flex-none tw:surface-material-vellum tw:[-webkit-backdrop-filter:var(--ds-material-filter)] tw:[backdrop-filter:var(--ds-material-filter)] tw:elevation-material-library-top-box-shadow tw:reduced-transparency:[-webkit-backdrop-filter:none] tw:reduced-transparency:[backdrop-filter:none] tw:reduced-transparency:surface-surface-raised",
    actions: "lib-top-r tw:flex tw:items-center tw:gap-small",
    scroll: "lib-scroll tw:flex-1 tw:overflow-y-auto tw:p-library-scroll-padding tw:max-compact-inclusive:pt-section-dense",
    heading: "lib-head tw:max-w-library-head-max-width tw:m-library-head-margin tw:flex tw:items-end tw:justify-between tw:gap-group tw:flex-wrap tw:[&_h1]:m-library-head-h1-margin tw:[&_h1]:type-library-head-h1-font tw:max-compact-inclusive:mb-action tw:[&_h1.ens-title]:mb-snug tw:[&_h1]:[font-family:var(--ds-type-library-heading-font-family)] tw:[&_h1]:[font-weight:var(--ds-type-library-heading-font-weight)] tw:[&_h1]:[font-size:var(--ds-type-library-heading-font-size)] tw:[&_h1]:[line-height:var(--ds-type-library-heading-line-height)] tw:[&_h1]:[letter-spacing:var(--ds-type-library-heading-letter-spacing)] tw:[&_h1]:[text-transform:var(--ds-type-library-heading-text-transform)] tw:[&_h1]:[font-synthesis:var(--ds-type-library-heading-font-synthesis)]",
    count: "tw:m-none tw:text-ink-secondary tw:text-button",
    tools: "lib-tools tw:flex tw:gap-inline tw:items-center tw:flex-wrap tw:max-compact-inclusive:w-full tw:max-score-inclusive:flex-wrap",
    tip: "lib-tip tw:max-w-library-tip-max-width tw:m-library-tip-margin tw:flex tw:items-center tw:gap-inline tw:text-ink-muted tw:text-toast tw:[&_.ic]:w-action tw:[&_.ic]:h-action tw:hover-none:hidden",
    dropZone: "drop-veil tw:absolute tw:inset-control tw:z-drop-veil-z-index tw:hidden tw:place-items-center tw:frame-all-drop-veil-border tw:rounded-dialog tw:surface-material-drop-veil-background tw:text-headline-small tw:font-weight-label tw:pointer-events-none tw:[&_span]:flex tw:[&_span]:items-center tw:[&_span]:gap-control tw:[#library.drag-over_&]:grid",
  } as const;
}

export function titleArtworkRecipe() {
  return {
    root: "ls-name tw:[:root[data-start='neu']_&]:relative tw:[:root[data-start='neu']_&]:block tw:[:root[data-start='neu']_&]:m-title-name-margin tw:[:root[data-start='neu']_&.light-settled_.ls-light]:animate-title-name-light-settled-title-light-animation tw:motion-safe:[:root[data-start='neu']_&]:animate-title-name-animation tw:[:root[data-title='zeile']_&]:animate-none tw:[:root[data-title='zeile']_&.light-written_.ls-light]:animate-title-name-light-written-title-light-animation tw:[:root[data-title='zeile']_&.light-settled_.ls-light]:animate-title-name-light-settled-title-light-animation-flare tw:[:root[data-title='buehne']_&]:animate-none tw:[:root[data-title='buehne']_&_.ls-light]:opacity-title-name-title-light-title-name-light-settled-title-light-opacity tw:[:root[data-title='buehne']_&_.ls-light]:[filter:var(--ds-title-name-title-light-title-name-light-settled-title-light-filter)] tw:[:root[data-title='buehne']_&_.ls-light]:animate-none tw:[:root[data-title='buehne']_&.light-settled_.ls-light]:opacity-title-name-title-light-title-name-light-settled-title-light-opacity tw:[:root[data-title='buehne']_&.light-settled_.ls-light]:[filter:var(--ds-title-name-title-light-title-name-light-settled-title-light-filter)] tw:[:root[data-title='buehne']_&.light-settled_.ls-light]:animate-none tw:[:root[data-title='buehne']_&.lit_.ls-light]:opacity-visible tw:[:root[data-title='buehne']_&.lit_.ls-light]:[filter:none] tw:[:root[data-title='buehne']_&.lit_.ls-light]:animate-title-name-lit-title-light-animation",
    light: "ls-light tw:[:root[data-start='neu']_&]:absolute",
  } as const;
}

export function powerHintRecipe() {
  return {
    root: "power-hint tw:[&_b]:block tw:[&_b]:text-button tw:[&_p]:m-power-hint-p-margin tw:[&_p]:text-body-small tw:[&_p]:leading-power-hint-p-line-height",
    actions: "power-hint-actions tw:flex tw:justify-end tw:items-center tw:gap-small",
  } as const;
}

export function tourRecipe() {
  return {
    root: "intro tw:fixed tw:inset-none tw:z-intro-z-index tw:[&.open_.intro-spot]:opacity-visible",
    block: "intro-block tw:absolute tw:inset-none",
    spot: "intro-spot tw:absolute tw:left-none tw:top-none tw:rounded-tile tw:pointer-events-none tw:surface-material-intro-spot-background tw:elevation-material-intro-spot-box-shadow tw:opacity-hidden tw:motion-intro-spot-transition tw:motion-reduce:motion-intro-spot-transition-reduced",
    head: "intro-head tw:flex tw:items-center tw:justify-between tw:gap-control",
    count: "intro-count tw:type-intro-count-font tw:tracking-intro-count-letter-spacing tw:text-material-intro-count-color",
    dots: "intro-dots tw:flex tw:gap-control-dense tw:[&_i]:w-snug tw:[&_i]:h-snug tw:[&_i]:rounded-round tw:[&_i]:surface-material-intro-dots-i-background tw:[&_i]:motion-intro-dots-i-transition tw:[&_i.on]:surface-material-intro-dots-i-on-background tw:[&_i.on]:[transform:var(--ds-intro-dots-i-on-transform)]",
    card: "intro-card tw:[&_h2]:m-intro-card-h2-margin tw:[&_h2]:type-intro-card-h2-font tw:[&_p]:m-intro-card-p-margin tw:[&_p]:text-toast tw:[&_p]:leading-intro-card-p-line-height tw:[&_h2]:[font-family:var(--ds-type-tour-title-font-family)] tw:[&_h2]:[font-weight:var(--ds-type-tour-title-font-weight)] tw:[&_h2]:[font-size:var(--ds-type-tour-title-font-size)] tw:[&_h2]:[line-height:var(--ds-type-tour-title-line-height)] tw:[&_h2]:[letter-spacing:var(--ds-type-tour-title-letter-spacing)] tw:[&_h2]:[text-transform:var(--ds-type-tour-title-text-transform)] tw:[&_h2]:[font-synthesis:var(--ds-type-tour-title-font-synthesis)]",
    actions: "intro-actions tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-intro-actions-gap",
    asides: "intro-asides tw:flex tw:ml-intro-asides-margin-left",
    moves: "intro-moves tw:flex tw:gap-small tw:ml-auto",
  } as const;
}

export function ensemblePanelRecipe() {
  return {
    dropSlot: "drop-slot tw:list-none tw:frame-all-drop-slot-border tw:rounded-tile tw:surface-material-drop-slot-background",
    body: "domain-sheet tw:grid tw:gap-domain-sheet-gap tw:[&_form]:grid tw:[&_form]:gap-domain-sheet-form-gap tw:[&_:focus-visible]:[outline:var(--ds-account-stage-focus-visible-domain-sheet-focus-visible-outline)] tw:[&_:focus-visible]:[outline-offset:var(--ds-space-compact)]",
    memberRow: "member-row tw:p-member-row-padding tw:frame-bottom-member-row-border-bottom tw:grid tw:gap-member-row-gap",
    accent: "domain-gold tw:text-material-domain-gold-color tw:type-domain-gold-invitation-state-font tw:uppercase tw:tracking-domain-gold-invitation-state-letter-spacing",
    heading: "domain-heading tw:m-domain-heading-margin tw:pt-domain-heading-padding-top tw:frame-top-domain-heading-border-top tw:type-domain-heading-font tw:uppercase tw:tracking-domain-heading-letter-spacing tw:text-ink-secondary tw:first:frame-clear tw:first:pt-none tw:first:mt-none",
    memberHead: "member-head tw:flex tw:items-center tw:gap-control",
    identity: "member-identity tw:min-w-none tw:flex-1 tw:[&_b]:type-member-identity-b-font",
    email: "member-email tw:block tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:m-member-email-margin tw:text-ink-secondary tw:type-member-email-font",
    invitationState: "invitation-state tw:type-domain-gold-invitation-state-font tw:uppercase tw:tracking-domain-gold-invitation-state-letter-spacing tw:text-ink-secondary",
    capabilities: "capability-row tw:flex tw:flex-wrap tw:gap-capability-row-gap",
    rowMenu: "row-menu tw:relative tw:flex-none tw:[&_summary]:list-none tw:[&_summary]:cursor-pointer tw:[&_summary]:p-row-menu-summary-padding tw:[&_summary]:text-workspace-wordmark tw:[&_summary]:text-ink-secondary",
  } as const;
}

export function accountStageRecipe() {
  return {
    root: "account-stage tw:min-h-account-stage-min-height tw:text-ink tw:bg-surface-sunken tw:[background-image:var(--ds-material-fibre)] tw:overflow-auto tw:relative tw:font-auth-body tw:[&_>_.language-toggle]:absolute tw:[&_>_.language-toggle]:top-section-dense tw:[&_>_.language-toggle]:right-section tw:[&_>_.language-toggle]:z-account-stage-language-toggle-z-index tw:[&_:focus-visible]:[outline:var(--ds-account-stage-focus-visible-domain-sheet-focus-visible-outline)] tw:[&_:focus-visible]:[outline-offset:var(--ds-space-compact)]",
    content: "account-content tw:relative tw:z-account-content-z-index tw:w-account-content-width tw:m-account-content-margin tw:p-account-content-padding tw:max-account-inclusive:pt-account-content-padding-top",
    ribbons: "account-ribbons tw:absolute tw:inset-none tw:w-full tw:h-full tw:opacity-account-ribbons-opacity tw:pointer-events-none",
    wordmark: "account-wordmark tw:type-account-wordmark-font tw:text-center tw:h-account-wordmark-height tw:m-account-wordmark-margin tw:relative tw:max-account-inclusive:h-account-wordmark-height-phone tw:max-account-inclusive:mb-control tw:[&_.ls-name]:relative tw:[&_.ls-name]:block tw:[&_.ls-name]:m-account-wordmark-title-name-margin! tw:[&_.ls-name]:animate-none tw:[&_.ls-light]:absolute tw:[&_.ls-light]:block tw:[&_.ls-score]:absolute tw:[&_.ls-score]:block tw:[&_.ls-score]:[filter:var(--ds-account-wordmark-title-score-filter)] tw:[&_.ls-light]:animate-none!",
    form: "auth-shell tw:w-auth-shell-width tw:m-auto tw:text-ink tw:[&_h2]:type-auth-shell-h2-font tw:[&_h2]:text-center tw:[&_h2]:m-auth-shell-h2-margin tw:[&_p:not(.ds-reset)]:leading-auth-shell-p-line-height tw:[&_p:not(.ds-reset)]:text-center tw:[&_p:not(.ds-reset)]:text-ink-secondary tw:[&_>_a]:block tw:[&_>_a]:text-center tw:[&_>_a]:text-ink-secondary tw:[&_.invitation-title]:text-accent-invitation tw:[&_.invitation-title]:text-invitation",
    links: "account-links tw:text-center tw:mt-section-dense tw:text-ink-secondary tw:leading-account-links-line-height",
    email: "account-email tw:font-auth-mono tw:wrap-anywhere",
    hint: "account-hint tw:text-body-small",
    invitationKicker: "invitation-kicker tw:block tw:text-section tw:mb-small",
  } as const;
}

export function transcriptionJobRecipe() {
  return {
    list: "tw:font-auth-body tw:[&_h2]:type-transcription-review-panel-h2-transcription-jobs-h2-transcription-job-h3-font tw:[&_h2]:m-none tw:mb-heading tw:[&_h2]:mb-content tw:[&[hidden]]:hidden!",
    reviewPanel: "tx-review-panel tw:[&_h2]:type-transcription-review-panel-h2-transcription-jobs-h2-transcription-job-h3-font tw:[&_h2]:m-none tw:max-h-transcription-review-panel-max-height tw:overflow-auto tw:p-compact tw:max-score-inclusive:max-h-none tw:max-score-inclusive:frame-top-transcription-review-panel-border-top tw:max-score-inclusive:pt-section",
    root: "tx-job tw:[&_h3]:type-transcription-review-panel-h2-transcription-jobs-h2-transcription-job-h3-font tw:[&_h3]:m-none tw:p-group tw:m-transcription-job-margin tw:frame-all-transcription-job-border tw:surface-transcription-job-background tw:rounded-card-roomy tw:relative tw:[&_h3]:text-position tw:[&_details]:ml-auto tw:[&_details]:relative tw:[&_summary]:cursor-pointer tw:[&_summary]:text-transcription-mobile tw:[&_summary]:p-transcription-job-summary-padding tw:[&_summary]:list-none tw:[&_summary]:text-ink-secondary tw:[&_summary:focus-visible]:[outline:var(--ds-transcription-job-summary-focus-visible-outline)] tw:[&_summary:focus-visible]:[outline-offset:var(--ds-space-compact)]",
    choices: "tx-choices tw:flex tw:gap-inline tw:items-center tw:flex-wrap tw:max-score-inclusive:gap-small",
    actions: "tx-actions tw:flex tw:gap-inline tw:items-center tw:flex-wrap",
    tile: "tx-tile tw:[&_.ic]:w-transcription-tile-icon-width tw:[&_.ic]:h-transcription-tile-icon-height tw:[&_.ic]:mb-snug tw:[&_.tx-pencil]:text-small tw:[&_.tx-pencil]:font-weight-body tw:max-score-inclusive:[&_.tx-pencil]:text-caption",
    language: "tx-language tw:flex tw:items-center tw:gap-inline tw:flex-wrap tw:frame-bottom-transcription-language-border-bottom tw:pb-snug tw:max-score-inclusive:gap-small",
    pencil: "tx-pencil tw:text-body-small tw:leading-transcription-pencil-line-height tw:text-ink-secondary",
    start: "tx-start tw:mt-inline",
    error: "tx-error tw:text-danger tw:leading-transcription-error-line-height tw:[&:empty]:hidden",
    photos: "tx-photos tw:flex tw:gap-control tw:overflow-x-auto tw:p-transcription-photos-padding tw:[&:empty]:hidden",
    photo: "tx-photo tw:[flex:var(--ds-transcription-photo-flex)] tw:wrap-anywhere tw:text-label tw:[&_img]:block tw:[&_img]:w-transcription-photo-img-width tw:[&_img]:h-transcription-photo-img-height tw:[&_img]:object-contain tw:[&_img]:surface-surface-sunken tw:[&_img]:rounded-tile-dense tw:[&_img]:mb-small tw:[&_progress]:w-full tw:[&_progress]:h-compact tw:[&_progress]:accent-transcription-accent",
    field: "tx-field tw:[&_+_.tx-pencil]:font-auth-mono tw:[&_+_.tx-pencil]:text-small",
    segments: "tx-segments tw:flex tw:gap-tight tw:h-compact tw:m-transcription-segments-margin",
    segment: "tx-segment tw:flex-1 tw:surface-ink-secondary tw:[&.completed]:surface-transcription-accent tw:[&.running]:animate-transcription-segment-running-animation tw:[&.failed]:surface-danger tw:[&.skipped]:bg-transparent tw:[&.skipped]:frame-top-transcription-segment-skipped-border-top tw:motion-reduce:[&.running]:animate-none",
    reviewLayout: "tx-review-layout tw:grid tw:[grid-template-columns:var(--ds-transcription-review-layout-grid-template-columns)] tw:gap-panel tw:max-score-inclusive:flex tw:max-score-inclusive:flex-col tw:max-score-inclusive:gap-section",
    scoreWrap: "tx-score-wrap tw:flex tw:gap-section tw:min-w-none tw:overflow-auto tw:items-start tw:max-h-transcription-score-wrap-max-height tw:min-h-transcription-score-wrap-min-height tw:pt-transcription-score-wrap-padding-top tw:box-border tw:max-score-inclusive:max-h-transcription-score-wrap-max-height-phone tw:max-score-inclusive:min-h-transcription-score-wrap-min-height-phone tw:max-score-inclusive:pt-section",
    score: "tx-score tw:min-w-none tw:flex-1 tw:max-score-inclusive:min-w-full",
    scorePage: "tx-score-page tw:text-ink tw:m-transcription-score-page-margin tw:max-w-transcription-score-page-max-width tw:[&_svg]:block tw:[&_svg]:w-full tw:[&_svg]:h-auto tw:[&_svg]:max-h-none tw:[&_svg]:fill-current tw:[&_svg]:overflow-visible tw:[&_svg_[color]]:text-inherit tw:[&_svg_[fill=",
    original: "tx-original tw:flex-1 tw:min-w-transcription-original-min-width tw:m-none tw:sticky tw:top-none tw:[&_img]:w-full tw:[&_img]:rounded-media tw:[&_figcaption]:type-transcription-original-figcaption-font tw:[&_figcaption]:text-ink-secondary tw:[&_figcaption]:mb-control tw:max-score-inclusive:min-w-transcription-original-min-width-phone",
    reviewItems: "tx-review-items tw:list-none tw:p-none",
    reviewActions: "tx-review-actions tw:grid tw:gap-control tw:mt-section",
    secondary: "tx-secondary tw:flex tw:gap-content tw:items-center tw:flex-wrap",
    glyph: "tx-glyph tw:inline-flex tw:items-center tw:justify-center tw:flex-none tw:font-weight-label tw:text-transcription-accent tw:w-action tw:h-action tw:[&.warning]:text-transcription-warning tw:[&.warning]:frame-all-transcription-glyph-warning-border tw:[&.warning]:rounded-round tw:[&.warning]:text-small tw:[&.warning]:box-border",
    wash: "tx-wash tw:fill-current tw:opacity-transcription-wash-opacity tw:pointer-events-none",
    mark: "tx-mark tw:fill-transcription-accent tw:font-auth-body tw:font-weight-label tw:[&.warning]:fill-transcription-warning",
    markRing: "tx-mark-ring tw:fill-none tw:stroke-transcription-warning tw:[stroke-width:var(--ds-transcription-mark-ring-stroke)]",
    flash: "tx-flash tw:[&.tx-flash_.tx-wash]:animate-transcription-flash-transcription-wash-animation tw:motion-reduce:[&.tx-flash_.tx-wash]:animate-none",
    dialog: "transcription-dialog tw:[&_[hidden]]:hidden!",
    entry: "tw:[&[hidden]]:hidden!",
  } as const;
}

export function sheetHandleRecipe() {
  return "sheet-grab tw:absolute tw:top-none tw:left-sheet-grab-left tw:w-toolbar tw:h-control-dense tw:ml-sheet-grab-margin-left tw:rounded-control-dense tw:surface-rule-strong";
}

export function controlNoteRecipe() {
  return "ctl-note tw:select-none tw:block tw:text-note tw:text-ink-secondary";
}
