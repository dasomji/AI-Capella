import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
export function roleManifest(source) {
  const roles = new Set();
  postcss.parse(source).walkDecls(decl => { if (decl.prop.startsWith('--ds-')) roles.add(decl.prop.slice(5)); });
  return [...roles].sort();
}
export function writeRoleManifest() {
  const source = new URL('../src/design-system/tokens.css', import.meta.url);
  const target = new URL('../src/design-system/theme/roles.generated.ts', import.meta.url);
  const text = '// Generated from tokens.css by scripts/design-token-manifest.mjs. Do not edit.\nexport const themeRoleNames = '+JSON.stringify(roleManifest(fs.readFileSync(source, 'utf8')), null, 2)+' as const;\n';
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text) fs.writeFileSync(target, text);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) writeRoleManifest();
