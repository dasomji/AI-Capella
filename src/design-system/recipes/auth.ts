/** Shared pre-hydration auth/brand composition. */


export function brandRecipe() {
  return {
    wordmark: "wordmark tw:type-wordmark-font tw:tracking-wordmark-letter-spacing tw:whitespace-nowrap tw:[&[aria-label='LightScore']]:surface-material-wordmark-aria-label-lightscore-background tw:[&[aria-label='LightScore']]:[-webkit-background-clip:var(--ds-material-wordmark-aria-label-lightscore-vendor-background-clip)] tw:[&[aria-label='LightScore']]:[background-clip:var(--ds-material-wordmark-aria-label-lightscore-background-clip)] tw:[&[aria-label='LightScore']]:text-transparent tw:[font-family:var(--ds-type-wordmark-font-family)] tw:[font-weight:var(--ds-type-wordmark-font-weight)] tw:[font-synthesis:var(--ds-type-wordmark-font-synthesis)]",
    script: "ls-l tw:surface-material-clear tw:bg-clip-border tw:bg-clip-border tw:type-title-l-font tw:tracking-(--ds-tracking-zero) tw:mr-title-l-margin-right tw:text-material-title-l-color tw:[text-shadow:var(--ds-material-title-l-text-shadow)]",
    group: "brand tw:inline-flex tw:items-center tw:gap-inline tw:min-w-flush",
    mark: "mark tw:w-heading tw:h-heading tw:flex-none",
    ribbons: "ribbons tw:absolute tw:inset-flush tw:w-full tw:h-full tw:pointer-events-none",
  } as const;
}

export function accountStageRecipe() {
  return {
    root: "account-stage tw:min-h-account-stage-min-height tw:text-ink tw:bg-surface-sunken tw:[background-image:var(--ds-material-fibre)] tw:overflow-auto tw:relative tw:font-auth-body tw:[&_>_.language-toggle]:absolute tw:[&_>_.language-toggle]:top-section-dense tw:[&_>_.language-toggle]:right-section tw:[&_>_.language-toggle]:z-account-stage-language-toggle-z-index tw:[&_:focus-visible]:[outline:var(--ds-account-stage-focus-visible-domain-sheet-focus-visible-outline)] tw:[&_:focus-visible]:[outline-offset:var(--ds-space-compact)]",
    content: "account-content tw:relative tw:z-account-content-z-index tw:w-account-content-width tw:m-account-content-margin tw:p-account-content-padding tw:max-account-inclusive:pt-account-content-padding-top",
    ribbons: "account-ribbons tw:absolute tw:inset-flush tw:w-full tw:h-full tw:opacity-account-ribbons-opacity tw:pointer-events-none",
    wordmark: "account-wordmark tw:type-account-wordmark-font tw:text-center tw:h-account-wordmark-height tw:m-account-wordmark-margin tw:relative tw:max-account-inclusive:h-account-wordmark-height-phone tw:max-account-inclusive:mb-control tw:[&_.ls-name]:relative tw:[&_.ls-name]:block tw:[&_.ls-name]:m-account-wordmark-title-name-margin! tw:[&_.ls-name]:animate-none tw:[&_.ls-light]:absolute tw:[&_.ls-light]:block tw:[&_.ls-score]:absolute tw:[&_.ls-score]:block tw:[&_.ls-score]:[filter:var(--ds-account-wordmark-title-score-filter)] tw:[&_.ls-light]:animate-none!",
    form: "auth-shell tw:w-auth-shell-width tw:m-auto tw:text-ink tw:[&_h2]:type-auth-shell-h2-font tw:[&_h2]:text-center tw:[&_h2]:m-auth-shell-h2-margin tw:[&_p:not(.ds-reset)]:leading-auth-shell-p-line-height tw:[&_p:not(.ds-reset)]:text-center tw:[&_p:not(.ds-reset)]:text-ink-secondary tw:[&_>_a]:block tw:[&_>_a]:text-center tw:[&_>_a]:text-ink-secondary tw:[&_.invitation-title]:text-accent-invitation tw:[&_.invitation-title]:text-invitation",
    links: "account-links tw:text-center tw:mt-section-dense tw:text-ink-secondary tw:leading-account-links-line-height",
    email: "account-email tw:font-auth-mono tw:wrap-anywhere",
    hint: "account-hint tw:text-body-small",
    invitationKicker: "invitation-kicker tw:block tw:text-section tw:mb-small",
  } as const;
}