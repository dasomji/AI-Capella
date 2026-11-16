import source from './resolver.js?raw';
export { default as bootstrapTheme } from './resolver.js';
export type ThemeId = 'night-paper' | 'parchment' | 'velvet';
export type ThemePreference = 'system' | ThemeId;
/** Raw JavaScript is identical in SSR, hydration and the offline shell, independent of
 * minification or tsx's keepNames helpers. Runtime imports use the same resolver. */
export const themeBootstrapScript = `(${source.replace('export default ', '')})();`;
