/** The resolver is self-contained ES syntax: erase exports, retain its registry and helpers. */
export const inlineThemeSource = source => `(()=>{${source.replace(/\bexport default /g, '').replace(/\bexport /g, '')}\nbootstrapTheme();})();`;
