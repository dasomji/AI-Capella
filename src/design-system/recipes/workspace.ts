import { normalizeRecipe } from './normalize';
/** Ruled workspace composition. D06 retains the administration appearance. */
export const workspaceParts = [
  'page', 'header', 'wordmark', 'title', 'heading', 'subheading', 'paragraph',
  'filters', 'search', 'filter', 'presets', 'note', 'fieldset', 'legend',
  'definitions', 'definition', 'term', 'value', 'identifier', 'mono', 'content',
  'metrics', 'metric-value', 'permissions', 'inset', 'section-row', 'close',
  'language', 'ink', 'secondary', 'button-margin', 'pagination-field', 'region', 'sr-only', 'reason',
] as const;
export type WorkspacePart = typeof workspaceParts[number];
export function workspaceRecipe(part: WorkspacePart) {

  const parts: Record<WorkspacePart,string>={
    page:"tw:block tw:min-h-dvh tw:min-w-flush tw:max-w-full tw:bg-admin-surface tw:px-(--ds-workspace-inset) tw:py-panel tw:max-account:px-content tw:max-account:py-group tw:tabular-nums",
    header:"tw:block tw:relative tw:border-0 tw:border-b-(length:--ds-stroke-thin) tw:border-solid tw:border-admin-header-rule tw:pb-action tw:after:absolute tw:after:-bottom-px tw:after:inset-x-(--ds-workspace-rule-inset) tw:after:h-px tw:after:bg-admin-header-rule tw:after:content-(--ds-content-empty) tw:max-account:after:inset-x-(--ds-workspace-rule-phone-inset)",
    wordmark:'tw:inline tw:font-auth-display tw:text-workspace-wordmark tw:underline',
    title:"tw:block tw:font-auth-display tw:font-weight-medium tw:text-admin tw:my-action tw:max-account:text-admin-mobile",
    heading:"tw:block tw:font-auth-display tw:font-weight-medium tw:text-workspace-heading tw:my-(--ds-workspace-heading-margin)",
    subheading:"tw:block tw:font-auth-mono tw:font-weight-body tw:text-body-small tw:leading-leading-admin tw:uppercase tw:tracking-(--ds-tracking-label) tw:my-(--ds-workspace-subheading-margin)",
    paragraph:"tw:block tw:my-content",
    filters:"tw:flex tw:items-end tw:flex-wrap tw:gap-content tw:my-section",
    search:'tw:flex-1 tw:min-w-(--ds-workspace-search-min) tw:max-account:basis-(--ds-workspace-filter-min) tw:max-account:max-w-full',
    filter:'tw:max-account:flex-1 tw:max-account:basis-(--ds-workspace-filter-min) tw:max-account:max-w-full',
    presets:'tw:block',
    note:'tw:block tw:font-auth-body tw:text-small tw:text-admin-secondary',
    fieldset:"tw:block tw:border-0 tw:p-flush tw:m-flush tw:max-w-full tw:text-admin-secondary tw:max-account:basis-full",
    legend:"tw:block tw:px-micro tw:font-auth-body tw:text-label tw:text-admin-secondary",
    definitions:"tw:block tw:my-control",
    definition:"tw:grid tw:grid-cols-(--ds-workspace-definition-columns) tw:gap-content tw:py-snug tw:max-account:grid-cols-(--ds-workspace-definition-phone-columns)",
    term:'tw:block tw:text-label tw:text-admin-secondary',
    value:"tw:block tw:m-flush tw:text-label tw:font-auth-mono tw:whitespace-pre-wrap tw:wrap-anywhere",
    identifier:"tw:inline-flex tw:items-center tw:gap-compact",
    mono:'tw:inline tw:font-auth-mono tw:wrap-anywhere',
    content:"tw:block tw:my-control tw:font-auth-mono tw:text-small tw:whitespace-pre-wrap tw:wrap-anywhere",
    metrics:"tw:grid tw:grid-cols-(--ds-workspace-metric-columns) tw:gap-control",
    'metric-value':"tw:inline tw:font-weight-strong tw:text-metric",
    permissions:"tw:grid tw:gap-small tw:my-inline",
    inset:"tw:block tw:border-(length:--ds-stroke-thin) tw:border-solid tw:border-admin-rule tw:p-content tw:my-content",
    'section-row':"tw:block tw:border-0 tw:border-b-(length:--ds-stroke-thin) tw:border-solid tw:border-admin-rule tw:py-control",
    close:"tw:absolute tw:right-content tw:top-control",
    ink:'tw:text-admin-ink',
    secondary:'tw:text-admin-secondary',
    language:"tw:absolute tw:right-flush tw:top-flush",
    'button-margin':"tw:m-compact",
    'pagination-field':'tw:ml-auto',
    region:"tw:block tw:min-w-flush tw:max-w-full",
    'sr-only':'tw:sr-only',
    reason:"tw:block tw:mb-group",
  };
  // Inline data retains its surrounding table/definition typography.
  const classes=parts[part];
  const type=(/tw:font-(auth-body|auth-display|auth-mono)/.test(classes)?'':'tw:font-auth-body ')+(/tw:text-(body|body-small|label|small|section|admin|metric|workspace-heading|workspace-wordmark)( |$)/.test(classes)?'':'tw:text-body ')+(/tw:leading-/.test(classes)?'':"tw:leading-leading-body ")+(/tw:text-admin-(ink|secondary)/.test(classes)?'':'tw:text-admin-ink ');
  const typography=['page','header','wordmark','title','heading','subheading','note','legend','term','value','mono','content'];
  return typography.includes(part) ? normalizeRecipe('tw:box-border '+(part==='subheading'?'':'tw:tabular-nums ')+type+classes) : classes;
}
export interface NavigationOptions { variant?: 'admin' }
export function navigationRecipe(_options: NavigationOptions={}) {
  return normalizeRecipe({
    root:"tw:flex tw:gap-section tw:overflow-auto tw:max-account:gap-action",
    item:(current=false)=>"tw:inline tw:shrink-0 tw:font-auth-mono tw:font-weight-body tw:text-body-small tw:leading-leading-admin tw:uppercase tw:tracking-(--ds-tracking-label) tw:py-inline tw:px-flush tw:whitespace-nowrap tw:focus-visible:outline-(length:--ds-stroke-focus) tw:focus-visible:[outline-color:var(--ds-admin-accent)] tw:focus-visible:outline-offset-(--ds-space-tight) tw:tabular-nums "+(current?'tw:text-admin-accent tw:underline tw:underline-offset-(--ds-space-small)':'tw:text-admin-ink tw:no-underline'),
  });
}
