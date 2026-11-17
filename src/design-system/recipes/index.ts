export * from './controls';
export * from './display';
export * from './overlays';
/** Layout-only extension, deliberately finite: visual overrides are not part of the API. */
export type LayoutClass = 'tw:w-full' | 'tw:flex-1' | 'tw:shrink-0' | 'tw:ml-auto' | 'tw:mt-12' | 'tw:mb-12';
export function withLayout(recipe: string, layout?: LayoutClass) { return layout ? recipe+' '+layout : recipe; }
