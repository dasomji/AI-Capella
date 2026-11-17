import { normalizeRecipe } from "./normalize";
/** D09/D11/D15: account and device recipes preserve native semantics and domain hooks. */
export const accountStyles = {
  navigationSwitch: "tw:max-w-full tw:min-w-flush tw:wrap-anywhere tw:hyphens-auto tw:[&_.ic]:flex-none tw:normal-case tw:inline-flex tw:items-center tw:gap-navigation-switch-gap tw:font-inherit tw:font-family-inherit tw:text-inherit tw:text-left tw:tracking-(--ds-tracking-default) tw:font-smoothing-inherit tw:locale-inherit tw:tap-highlight-inherit tw:select-text tw:[&_.ic]:w-navigation-switch-icon tw:[&_.ic]:h-navigation-switch-icon tw:[&_.ic]:opacity-opacity-half tw:[&_.ic]:motion-account-navigation-switch-transition tw:[&:hover_.ic]:opacity-navigation-switch-hover-opacity tw:[&:hover_.ic]:[transform:var(--ds-account-navigation-switch-transform)]",
  navigationOther: "tw:max-w-full tw:wrap-anywhere tw:hyphens-auto tw:font-inherit tw:font-family-inherit tw:text-navigation-other-size tw:text-ink-secondary tw:opacity-navigation-other-opacity tw:p-navigation-other-padding tw:motion-account-navigation-other-transition tw:font-smoothing-inherit tw:locale-inherit tw:tap-highlight-inherit tw:select-none tw:text-center tw:[&:hover]:opacity-opacity-visible tw:[&:hover]:text-ink",
  offlineMark: "tw:text-accent-offline",
  songCard: "tw:[&[data-offline-unavailable]]:opacity-opacity-disabled-offline",
  body: "tw:min-w-flush tw:wrap-anywhere tw:[&>*]:min-w-flush tw:grid tw:gap-account-gap tw:font-inherit tw:font-family-inherit tw:text-inherit tw:font-smoothing-inherit tw:locale-inherit tw:tap-highlight-inherit tw:select-text tw:[&_:focus-visible]:[outline:var(--ds-account-body-outline)] tw:[&_:focus-visible]:outline-offset-(--ds-space-compact) tw:[&_*]:font-smoothing-inherit tw:[&_*]:locale-inherit tw:[&_*]:tap-highlight-inherit tw:[&_*]:select-text",
  note: "tw:block tw:m-account-note-margin tw:font-inherit tw:font-family-inherit tw:text-inherit",
  error: "tw:block tw:m-account-error-margin tw:font-inherit tw:font-family-inherit tw:text-danger",
  email: "tw:block tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:m-account-email-margin tw:text-ink-secondary tw:type-account-email-font",
  heading: "tw:m-account-heading-margin tw:pt-account-gap tw:frame-top-account-heading-border-top tw:type-account-heading-font tw:uppercase tw:tracking-account-heading-tracking tw:text-ink-secondary tw:[&:first-child]:border-0 tw:[&:first-child]:pt-flush tw:[&:first-child]:mt-flush",
  adminLink: "tw:font-inherit tw:font-family-inherit tw:text-account-link tw:[text-decoration:revert] tw:cursor-pointer",
} as const;
export const accountParts = ["body","email","note","heading","admin-link"] as const;
export type AccountPart = (typeof accountParts)[number];
const parts = {
  "body": ["ds-account-body sheet-body domain-sheet account-sheet", accountStyles.body].join(" "),
  "email": ["ds-account-email member-email", accountStyles.email].join(" "),
  "note": ["ds-account-note", accountStyles.note].join(" "),
  "heading": ["ds-account-heading domain-heading", accountStyles.heading].join(" "),
  "admin-link": ["ds-account-admin-link", accountStyles.adminLink].join(" "),
};
export function accountPartRecipe(part: AccountPart) { return normalizeRecipe(parts[part]); }
export function accountErrorRecipe() { return "ds-account-error account-error " + accountStyles.error; }
