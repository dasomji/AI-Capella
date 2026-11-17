/** Output boundaries only: tokens.css remains the sole authored design-value source. */
export const foundationSources = [
  './recipes/controls.ts', './recipes/display.ts', './recipes/overlays.ts',
  './recipes/layout.ts', './recipes/workspace.ts', './recipes/auth.ts',
  './react/adapter.tsx', '../auth-ui.tsx', '../account-stage.tsx', '../admin-ui.tsx',
  '../routes/__root.tsx', '../routes/index.tsx', '../routes/invite.$token.tsx', '../routes/admin.$.tsx',
];
export const areaStyles = ['library', 'account', 'player', 'panels'];
export function foundationCss(source) {
  for (const area of areaStyles) source = source.replace(`@import './${area}.css' layer(components);`, '');
  return source.replace("@source '../';", foundationSources.map(file=>`@source '${file}';`).join('\n'));
}
export function designCssSplitPlugin() {
  return {name:'design-css-output-boundaries',enforce:'pre',apply:'build',
    transform(source,id) {
      if (!source.includes('@source')) return;
      if (id.split('?')[0].endsWith('/design-system/app.css')) return foundationCss(source);
      // The catalog and its transform specimen are development-only sources.
      if (id.split('?')[0].endsWith('/design-system/workspace.css'))
        return source+"\n@source not './showcase.tsx';\n@source not './catalog.tsx';\n";
    },
  };
}
