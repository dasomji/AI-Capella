import source from './resolver.js?raw';
import { inlineThemeSource } from '../../../scripts/theme-source.mjs';
import { themeRegistry } from './resolver.js';
export { default as bootstrapTheme, themeRegistry, themePreference, experimentalPresets } from './resolver.js';
export type ThemeId = typeof themeRegistry[number]['id'];
export type ThemePreference = 'system' | ThemeId;
/** Identical raw resolver source in SSR, hydration and offline startup. */
export const themeBootstrapScript = inlineThemeSource(source);
