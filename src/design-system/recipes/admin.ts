/**
 * Administration composition (D06 A, D16 A): the shared LightScore paper, ink, accent and lettering
 * in a deliberately compact work layout. Controls, fields, dialogs and tables come from the shared
 * primitives; these slots only arrange them.
 */
const focus =
  "tw:focus-visible:outline-solid tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:outline-focus tw:focus-visible:outline-offset-(--ds-space-compact)";
const line = "tw:border-0 tw:border-b-(length:--ds-stroke-thin) tw:border-solid tw:border-rule";
const panel = "tw:bg-surface tw:border-(length:--ds-stroke-thin) tw:border-solid tw:border-rule tw:rounded-card";

export function adminRecipe() {
  return {
    shell:
      "tw:block tw:box-border tw:min-h-dvh tw:min-w-flush tw:bg-surface-sunken tw:[background-image:var(--ds-material-fibre)] tw:text-ink tw:font-control tw:text-body tw:leading-leading-body tw:pt-(--ds-admin-shell-top) tw:pb-(--ds-admin-shell-bottom) tw:pl-(--ds-admin-shell-left) tw:pr-(--ds-admin-shell-right)",
    frame: "tw:block tw:mx-auto tw:min-w-flush tw:max-w-(--ds-admin-page-width)",
    bar: "tw:flex tw:flex-wrap tw:items-center tw:gap-x-control tw:gap-y-compact tw:pb-small",
    brand:
      "tw:inline-flex tw:items-baseline tw:gap-small tw:min-w-flush tw:rounded-field tw:no-underline tw:text-ink " + focus,
    wordmark: "tw:font-brand tw:text-section tw:font-weight-medium tw:leading-leading-body tw:text-accent",
    area: "tw:font-control tw:text-body-small tw:text-ink-secondary",
    barEnd: "tw:ml-auto tw:flex tw:items-center tw:gap-control",
    back:
      "tw:inline-flex tw:items-center tw:min-h-control-height-compact tw:touch:min-h-control-target-touch tw:rounded-field tw:font-control tw:text-body-small tw:text-ink-secondary tw:no-underline tw:hover:text-ink " + focus,
    nav:
      "tw:flex tw:gap-micro tw:min-w-flush tw:max-w-full tw:overflow-x-auto tw:overscroll-x-contain tw:mb-section " + line,
    navItem: (current = false) =>
      "tw:inline-flex tw:shrink-0 tw:items-center tw:min-h-control-height-compact tw:touch:min-h-control-target-touch tw:px-control tw:rounded-field tw:font-control tw:text-body-small tw:font-weight-label tw:no-underline tw:whitespace-nowrap tw:border-0 tw:border-b-(length:--ds-stroke-focus) tw:border-solid tw:focus-visible:outline-solid tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:outline-focus tw:focus-visible:outline-offset-(--ds-space-none) " +
      (current ? "tw:text-ink tw:border-accent" : "tw:text-ink-secondary tw:border-transparent tw:hover:text-ink"),
    pageHead: "tw:flex tw:flex-wrap tw:items-end tw:justify-between tw:gap-control tw:mb-content",
    titleBlock: "tw:grid tw:gap-compact tw:min-w-flush",
    crumb:
      "tw:inline-flex tw:items-center tw:justify-self-start tw:min-h-control-height-compact tw:touch:min-h-control-target-touch tw:rounded-field tw:font-control tw:text-body-small tw:text-ink-secondary tw:no-underline tw:hover:text-ink " + focus,
    title: "tw:m-flush tw:font-display tw:text-workspace-heading tw:font-weight-medium tw:leading-leading-body tw:text-ink tw:wrap-anywhere",
    lede: "tw:m-flush tw:font-control tw:text-body-small tw:leading-leading-body tw:text-ink-secondary",
    meta: "tw:flex tw:flex-wrap tw:items-center tw:gap-small tw:font-control tw:text-body-small tw:text-ink-secondary tw:wrap-anywhere",
    toolbar: "tw:flex tw:flex-wrap tw:items-end tw:gap-x-control tw:gap-y-small tw:mb-content",
    search: "tw:grow tw:basis-(--ds-admin-search-width) tw:min-w-flush tw:max-w-full",
    filter: "tw:grow tw:basis-(--ds-admin-filter-width) tw:min-w-flush tw:max-w-full tw:panel:grow-0",
    range: "tw:flex tw:flex-wrap tw:items-end tw:gap-x-control tw:gap-y-small tw:min-w-flush",
    note: "tw:font-control tw:text-small tw:leading-leading-body tw:text-ink-secondary",
    stack: "tw:grid tw:gap-content tw:min-w-flush",
    columns: "tw:grid tw:gap-content tw:min-w-flush tw:grid-cols-(--ds-admin-section-columns)",
    section: "tw:block tw:box-border tw:min-w-flush tw:m-flush tw:p-content tw:max-account:p-control " + panel,
    sectionHead: "tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-small tw:mb-small",
    sectionTitle: "tw:m-flush tw:font-control tw:text-headline-small tw:font-weight-label tw:leading-leading-body tw:text-ink",
    sectionNote: "tw:m-flush tw:font-control tw:text-body-small tw:leading-leading-body tw:text-ink-secondary",
    definitions: "tw:grid tw:m-flush tw:min-w-flush",
    definition: "tw:grid tw:grid-cols-(--ds-admin-definition-columns) tw:gap-small tw:py-compact tw:min-w-flush tw:last:border-b-0 " + line,
    term: "tw:font-control tw:text-body-small tw:text-ink-secondary",
    value: "tw:m-flush tw:min-w-flush tw:font-control tw:text-body-small tw:text-ink tw:wrap-anywhere",
    badges: "tw:inline-flex tw:flex-wrap tw:items-center tw:gap-compact",
    identifier: "tw:inline-flex tw:items-center tw:gap-micro tw:min-w-flush tw:font-mono tw:text-small tw:text-ink-secondary",
    rowLink:
      "tw:rounded-field tw:font-weight-label tw:text-ink tw:underline tw:decoration-rule-strong tw:underline-offset-(--ds-space-micro) tw:hover:decoration-ink " + focus,
    metrics: "tw:grid tw:gap-small tw:min-w-flush tw:grid-cols-(--ds-admin-metric-columns)",
    metric: "tw:grid tw:gap-micro tw:min-w-flush tw:p-control " + panel,
    metricLabel: "tw:font-control tw:text-small tw:leading-leading-body tw:text-ink-secondary",
    metricValue: "tw:font-display tw:text-metric tw:leading-leading-body tw:text-ink tw:tabular-nums tw:wrap-anywhere",
    actions: "tw:flex tw:flex-wrap tw:items-center tw:gap-small",
    rowActions: "tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-compact tw:max-account:justify-start",
    dialogBody: "tw:grid tw:gap-content tw:min-w-flush",
    dialogActions: "tw:flex tw:flex-wrap tw:justify-end tw:gap-small",
    checks: "tw:grid tw:gap-micro tw:m-flush tw:p-flush tw:border-0 tw:min-w-flush",
    legend: "tw:p-flush tw:mb-compact tw:font-control tw:text-body-small tw:font-weight-label tw:text-ink",
    summary: "tw:m-flush tw:font-control tw:text-body-small tw:leading-leading-body tw:text-ink-secondary tw:wrap-anywhere",
    content:
      "tw:block tw:m-flush tw:mt-small tw:max-h-(--ds-admin-content-height) tw:overflow-auto tw:p-control tw:rounded-field tw:bg-surface-sunken tw:font-mono tw:text-small tw:leading-leading-body tw:text-ink tw:whitespace-pre-wrap tw:wrap-anywhere " + focus,
    picker: "tw:grid tw:m-flush tw:p-flush tw:list-none tw:max-h-(--ds-admin-picker-height) tw:overflow-y-auto tw:min-w-flush",
    srOnly: "tw:sr-only",
  } as const;
}
export type AdminSlots = ReturnType<typeof adminRecipe>;
