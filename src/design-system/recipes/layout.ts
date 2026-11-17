/** Layout-only extension, deliberately finite: visual overrides are not part of the API. */
export const layoutClasses = [
  "tw:max-compact:flex-1",
  "tw:w-full",
  "tw:mt-inline",
  "tw:my-section",
  "tw:pr-action-reserve",
  "tw:m-compact",
  "tw:mb-group",
  "tw:absolute",
  "tw:right-content",
  "tw:top-control",
  "tw:relative",
  "tw:sr-only",
  "tw:flex-1",
  "tw:shrink-0",
  "tw:ml-auto",
  "tw:mt-control",
  "tw:mb-control",
  "tw:col-span-full",
  "tw:col-span-2",
  "tw:row-span-2",
  "tw:col-start-1",
  "tw:col-start-2",
  "tw:self-start",
  "tw:self-center",
  "tw:self-end",
  "tw:self-stretch",
  "tw:justify-self-end",
  "tw:order-first",
  "tw:order-last",
  "tw:max-panel:hidden",
  "tw:panel:hidden",
  "tw:panel:order-last",
] as const;
export type LayoutClass =
  (typeof layoutClasses)[number] | readonly (typeof layoutClasses)[number][];
export function withLayout(recipe: string, layout?: LayoutClass) {
  return layout
    ? recipe + " " + (typeof layout === "string" ? layout : layout.join(" "))
    : recipe;
}

