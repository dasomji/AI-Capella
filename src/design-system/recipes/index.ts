export * from "./controls";
export * from "./display";
export * from "./overlays";
/** Layout-only extension, deliberately finite: visual overrides are not part of the API. */
export const layoutClasses = [
  "tw:w-full",
  "tw:flex-1",
  "tw:shrink-0",
  "tw:ml-auto",
  "tw:mt-12",
  "tw:mb-12",
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
