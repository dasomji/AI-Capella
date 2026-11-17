import { normalizeRecipe } from "./normalize";
/** Utilities retain hooks for behavior; every authored value resolves through tokens. */
const accountSlots = {
  "ds-navigation-switch":
    "tw:inline-flex tw:items-center tw:gap-library-navigation-switch-gap tw:font-inherit tw:color-inherit " +
    "tw:text-left tw:webkit-font-smoothing-inherit tw:webkit-locale-inherit tw:webkit-tap-highlight-color-inherit " +
    "tw:select-text tw:navigation-switch-ic:w-library-navigation-switch-icon " +
    "tw:navigation-switch-ic:h-library-navigation-switch-icon tw:navigation-switch-ic:opacity-library-opacity-half " +
    "tw:navigation-switch-ic:transition-account-navigation-switch-transition " +
    "tw:navigation-switch-hover-ic:opacity-library-navigation-switch-hover-opacity " +
    "tw:navigation-switch-hover-ic:transform-account-navigation-switch-transform",
  "ds-navigation-other":
    "tw:font-inherit tw:text-library-navigation-other-size tw:text-ink-secondary " +
    "tw:opacity-library-navigation-other-opacity tw:p-library-navigation-other-padding " +
    "tw:transition-account-navigation-other-transition tw:webkit-font-smoothing-inherit tw:webkit-locale-inherit " +
    "tw:webkit-tap-highlight-color-inherit tw:select-none tw:text-center tw:navigation-other-hover:opacity-100 " +
    "tw:navigation-other-hover:text-ink",
  "ds-offline-mark":
    "tw:text-library-accent-offline",
  "ds-library-song-card":
    "tw:library-song-card-data-offline-unavailable:opacity-library-opacity-disabled-offline",
  "ds-account-body":
    "tw:grid tw:gap-account-gap tw:font-inherit tw:color-inherit tw:webkit-font-smoothing-inherit " +
    "tw:webkit-locale-inherit tw:webkit-tap-highlight-color-inherit tw:select-text " +
    "tw:account-body-focus-visible:outline-account-body-outline tw:account-body-focus-visible:outline-offset-4 " +
    "tw:account-body-base:webkit-font-smoothing-inherit tw:account-body-base:webkit-locale-inherit " +
    "tw:account-body-base:webkit-tap-highlight-color-inherit tw:account-body-base:select-text",
  "ds-account-note":
    "tw:block tw:m-account-note-margin tw:font-inherit tw:color-inherit",
  "ds-account-error":
    "tw:block tw:m-account-error-margin tw:font-inherit tw:text-danger",
  "ds-account-email":
    "tw:block tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:m-account-email-margin " +
    "tw:text-ink-secondary tw:font-account-email-font",
  "ds-account-heading":
    "tw:m-account-heading-margin tw:pt-account-gap tw:border-top-account-heading-border-top " +
    "tw:font-account-heading-font tw:uppercase tw:tracking-account-heading-tracking tw:text-ink-secondary " +
    "tw:account-heading-first-child:border-0 tw:account-heading-first-child:pt-0 tw:account-heading-first-child:mt-0",
  "ds-account-admin-link":
    "tw:font-inherit tw:color-revert tw:text-decoration-revert tw:cursor-pointer",
  "ds-account-shared":
    "tw:flex tw:gap-library-domain-label-gap tw:items-center tw:flex-wrap tw:font-inherit tw:color-inherit " +
    "tw:account-shared-span:font-inherit tw:account-shared-span:color-inherit",
  "ds-account-password":
    "tw:flex tw:gap-library-domain-label-gap tw:items-center tw:flex-wrap tw:font-inherit tw:color-inherit",
  "ds-account-shared-input":
    "tw:appearance-auto tw:m-library-native-checkbox-margin tw:p-0 tw:font-inherit tw:color-inherit tw:accent-accent",
  "ds-account-label":
    "tw:font-inherit tw:color-inherit",
  "ds-account-input":
    "tw:w-full tw:min-w-0 tw:box-border tw:border-0 tw:border-bottom-account-input-border-bottom " +
    "tw:p-account-input-padding tw:background-library-clear tw:text-ink tw:font-account-input-font",
  "ds-account-delete-confirm":
    "tw:text-center",
} as const;
export function accountUtilityRecipe(hooks: string): string {
  return hooks.split(/\s+/).map(hook => hook + (hook in accountSlots ? " " + accountSlots[hook as keyof typeof accountSlots] : "")).join(" ");
}

export const accountParts = ["body", "email", "note", "heading", "admin-link"] as const;
export type AccountPart = (typeof accountParts)[number];
/** Account/device composition preserves the domain sheet's D09/D15 appearances. */
export function accountPartRecipe(part: AccountPart) {
  return normalizeRecipe(accountUtilityRecipe("ds-account-" + part + (part === "body" ? " sheet-body domain-sheet account-sheet" : part === "email" ? " member-email" : part === "heading" ? " domain-heading" : "")));
}
