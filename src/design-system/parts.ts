import * as recipes from './recipes';
import { createParts } from './parts-factory';
export { createParts } from './parts-factory';
export const { buttonPart, checkboxPart, toggleItemPart, menuItemPart, controlPart, toastPart, activationBlocked } = /* @__PURE__ */ createParts(recipes);
