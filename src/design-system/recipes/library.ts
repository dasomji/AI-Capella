import { normalizeRecipe } from "./normalize";
export const libraryParts = [
  "sheet-grab",
  "song-grid",
  "cover",
  "song-body",
  "song-title",
  "song-meta",
  "vdots",
  "banner",
  "paper-list",
  "paper-swatch",
  "paper-text",
  "landing-empty",
  "landing-aside",
  "empty-note",
] as const;
export type LibraryPart = (typeof libraryParts)[number];
/** Retained library appearance, including the class hooks used by reorder and tours. */
export function libraryPartRecipe(part: LibraryPart) {
  return normalizeRecipe("ds-library-" + part + " " + part);
}
