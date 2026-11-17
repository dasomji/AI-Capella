import fs from 'node:fs';
import postcss from 'postcss';
const assets = new URL('../src/design-system/assets/', import.meta.url);
/** Browser-installed artwork cannot inherit page CSS. Generate its default-theme values from tokens. */
export function designAssets(source = fs.readFileSync(new URL('../src/design-system/tokens.css', import.meta.url), 'utf8')) {
  const values = new Map();
  postcss.parse(source).walkRules(rule => {
    if (rule.selector === ':root' || rule.selector.includes('data-theme="night-paper"'))
      rule.walkDecls(decl => values.set(decl.prop, decl.value));
  });
  const resolve = (name, seen = new Set()) => {
    if (seen.has(name) || !values.has(name)) throw Error(`Unresolved browser artwork role ${name}`);
    return values.get(name).replace(/var\((--[\w-]+)\)/g, (_, next) => resolve(next, new Set([...seen, name])));
  };
  return Object.fromEntries(['favicon.svg', 'manifest.webmanifest'].map(file => [file,
    fs.readFileSync(new URL(file, assets), 'utf8').replace(/var\((--ds-[\w-]+)\)/g, (_, role) => resolve(role)),
  ]));
}
/** Identical assets in Vite development, production output and the offline asset manifest. */
export function designAssetsPlugin() {
  return {
    name: 'lightscore-design-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = (request.url ?? '').split('?')[0].slice(1);
        if (!['favicon.svg', 'manifest.webmanifest'].includes(file)) return next();
        response.setHeader('Content-Type', file.endsWith('.svg') ? 'image/svg+xml' : 'application/manifest+json');
        response.end(designAssets()[file]);
      });
    },
    generateBundle() {
      if (this.environment.name !== 'client') return;
      for (const [fileName, source] of Object.entries(designAssets())) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
