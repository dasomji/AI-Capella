import { normalizeRecipe } from "./normalize";
export const accountParts = ["body", "email", "note", "heading", "admin-link"] as const;
export type AccountPart = (typeof accountParts)[number];
/** Account/device composition preserves the domain sheet's D09/D15 appearances. */
export function accountPartRecipe(part: AccountPart) {
  return normalizeRecipe("ds-account-" + part + (part === "body" ? " sheet-body domain-sheet account-sheet" : part === "email" ? " member-email" : part === "heading" ? " domain-heading" : ""));
}
