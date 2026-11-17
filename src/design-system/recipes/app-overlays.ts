import { createOverlayRecipes } from './overlays';
import { libraryDialogRecipe, libraryMenuRecipe } from './library';
export * from './overlays';
export const {dialogRecipe, menuRecipe} = /* @__PURE__ */ createOverlayRecipes({dialog:libraryDialogRecipe,menu:libraryMenuRecipe});
