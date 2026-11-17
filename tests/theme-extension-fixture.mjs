import fs from 'node:fs';
import postcss from 'postcss';
export const testTheme = { id:'test-aurora',label:'Test aurora',aliases:['test-aurora'],storage:'test-aurora',defaultStart:null,colorScheme:'light',system:null };
/** The entire extra theme: one complete token block and one registry entry. Never shipped. */
export function themeExtensionPlugin() {
  const resolver = fs.readFileSync('src/design-system/theme/resolver.js','utf8');
  const extended = resolver.replace(']);', `${JSON.stringify(testTheme)}]);`);
  const css = postcss.parse(fs.readFileSync('src/design-system/tokens.css','utf8'));
  const block = css.nodes.find(n=>n.type==='rule'&&n.selector===':root[data-theme="parchment"]').clone({selector:':root[data-theme="test-aurora"]'});
  block.walkDecls('--ds-accent',d=>{d.value='#286666';});
  block.walkDecls('--ds-page-background',d=>{d.value='#dcf0e8';});
  return {name:'test-only-fourth-theme',enforce:'pre',
    load(id) { if(id.endsWith('/theme/resolver.js?raw'))return `export default ${JSON.stringify(extended)}`; },
    transform(code,id) {
      if(id.endsWith('/theme/resolver.js'))return extended;
      if(id.endsWith('/design-system/app.css'))return code+'\n@layer tokens {'+block.toString()+'}';
    },
  };
}
