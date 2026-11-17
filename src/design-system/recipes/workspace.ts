import { normalizeRecipe } from './normalize';
/** Ruled workspace composition. D06 retains the administration appearance. */
export const workspaceParts = [
  'page', 'header', 'wordmark', 'title', 'heading', 'subheading', 'paragraph',
  'filters', 'search', 'filter', 'presets', 'note', 'fieldset', 'legend',
  'definitions', 'definition', 'term', 'value', 'identifier', 'mono', 'content',
  'metrics', 'metric-value', 'permissions', 'inset', 'section-row', 'close',
  'language', 'button-margin', 'pagination-field', 'region', 'sr-only', 'reason',
] as const;
export type WorkspacePart = typeof workspaceParts[number];
export function workspaceRecipe(part: WorkspacePart) {

  const parts: Record<WorkspacePart,string>={
    page:'tw:block tw:min-h-dvh tw:min-w-0 tw:max-w-full tw:bg-admin-surface tw:px-(--ds-workspace-inset) tw:py-32 tw:max-account:px-16 tw:max-account:py-20 tw:tabular-nums',
    header:'tw:block tw:relative tw:border-0 tw:border-b tw:border-solid tw:border-admin-header-rule tw:pb-18 tw:after:absolute tw:after:bottom-px tw:after:inset-x-(--ds-workspace-rule-inset) tw:after:h-px tw:after:bg-admin-header-rule tw:after:content-(--ds-content-empty) tw:max-account:after:inset-x-(--ds-workspace-rule-phone-inset)',
    wordmark:'tw:inline tw:font-auth-display tw:text-workspace-wordmark tw:underline',
    title:'tw:block tw:font-auth-display tw:font-emphasis tw:text-admin tw:my-18 tw:max-account:text-admin-mobile',
    heading:'tw:block tw:font-auth-display tw:font-emphasis tw:text-section tw:my-(--ds-workspace-heading-margin)',
    subheading:'tw:block tw:font-auth-mono tw:font-regular tw:text-body-small tw:leading-admin tw:uppercase tw:tracking-auth-label tw:my-(--ds-workspace-subheading-margin)',
    paragraph:'tw:block tw:my-16',
    filters:'tw:flex tw:items-end tw:flex-wrap tw:gap-16 tw:my-24',
    search:'tw:flex-1 tw:min-w-(--ds-workspace-search-min) tw:max-account:basis-(--ds-workspace-filter-min) tw:max-account:max-w-full',
    filter:'tw:max-account:flex-1 tw:max-account:basis-(--ds-workspace-filter-min) tw:max-account:max-w-full',
    presets:'tw:block',
    note:'tw:block tw:font-auth-body tw:text-small tw:text-admin-secondary',
    fieldset:'tw:block tw:border-0 tw:p-0 tw:m-0 tw:max-w-full tw:text-admin-secondary tw:max-account:basis-full',
    legend:'tw:block tw:px-2 tw:font-auth-body tw:text-label tw:text-admin-secondary',
    definitions:'tw:block tw:my-12',
    definition:'tw:grid tw:grid-cols-(--ds-workspace-definition-columns) tw:gap-16 tw:py-6 tw:max-account:grid-cols-(--ds-workspace-definition-phone-columns)',
    term:'tw:block tw:text-label tw:text-admin-secondary',
    value:'tw:block tw:m-0 tw:text-label tw:font-auth-mono tw:whitespace-pre-wrap tw:wrap-anywhere',
    identifier:'tw:inline-flex tw:items-center tw:gap-4',
    mono:'tw:inline tw:font-auth-mono tw:wrap-anywhere',
    content:'tw:block tw:my-12 tw:font-auth-mono tw:text-small tw:whitespace-pre-wrap tw:wrap-anywhere',
    metrics:'tw:grid tw:grid-cols-(--ds-workspace-metric-columns) tw:gap-12',
    'metric-value':'tw:inline tw:font-strong tw:text-metric',
    permissions:'tw:grid tw:gap-8 tw:my-10',
    inset:'tw:block tw:border tw:border-solid tw:border-admin-rule tw:p-16 tw:my-16',
    'section-row':'tw:block tw:border-0 tw:border-b tw:border-solid tw:border-admin-rule tw:py-12',
    close:'tw:absolute tw:right-16 tw:top-12',
    language:'tw:absolute tw:right-0 tw:top-0',
    'button-margin':'tw:m-4',
    'pagination-field':'tw:ml-auto',
    region:'tw:block tw:min-w-0 tw:max-w-full',
    'sr-only':'tw:sr-only',
    reason:'tw:block tw:mb-20',
  };
  // Inline data retains its surrounding table/definition typography.
  const classes=parts[part];
  const type=(/tw:font-(auth-body|auth-display|auth-mono)/.test(classes)?'':'tw:font-auth-body ')+(/tw:text-(body|body-small|label|small|section|admin|metric|wordmark)( |$)/.test(classes)?'':'tw:text-body ')+(/tw:leading-/.test(classes)?'':'tw:leading-body ')+(/tw:text-admin-(ink|secondary)/.test(classes)?'':'tw:text-admin-ink ');
  return part==='identifier' ? classes : normalizeRecipe('tw:box-border '+type+classes);
}
export interface NavigationOptions { variant?: 'admin' }
export function navigationRecipe(_options: NavigationOptions={}) {
  return normalizeRecipe({
    root:'tw:flex tw:gap-24 tw:overflow-auto tw:max-account:gap-18',
    item:(current=false)=>'tw:inline tw:shrink-0 tw:font-auth-mono tw:font-regular tw:text-body-small tw:leading-admin tw:uppercase tw:tracking-auth-label tw:py-10 tw:px-0 tw:whitespace-nowrap tw:focus-visible:outline-2 tw:focus-visible:outline-admin-accent tw:focus-visible:outline-offset-3 '+(current?'tw:text-admin-accent tw:underline tw:underline-offset-8':'tw:text-admin-ink tw:no-underline'),
  });
}
