import fs from 'node:fs';
import postcss from 'postcss';
export const testTheme = { id:'test-aurora',label:'Test aurora',aliases:['test-aurora'],storage:'test-aurora',defaultStart:null,colorScheme:'dark',system:null };
/** Deliberately disagree with night-paper, including neutral pigments and alias-backed paint. */
export function loudThemeBlock(source) {
  const css = postcss.parse(source), values = new Map();
  css.walkRules(rule => { if (rule.selector === ':root') rule.walkDecls(d => values.set(d.prop, d.value)); });
  const block = css.nodes.find(n => n.type === 'rule' && n.selectors?.includes(':root[data-theme="night-paper"]')).clone({selector:':root[data-theme="test-aurora"]'});
  if(block.type!=='rule')throw Error('Theme block must be a CSS rule');
  block.walkDecls(d => values.set(d.prop, d.value));
  function resolve(value, seen = new Set()) {
    return value.replace(/var\(\s*(--[\w-]+)(?:\s*,\s*([^()]*))?\)/g, (all, name, fallback) => {
      if (seen.has(name)) return all;
      return values.has(name) ? resolve(values.get(name), new Set([...seen, name])) : fallback ?? all;
    });
  }
  const shifted = (r,g,b,a) => `rgba(${(g+121)%256}, ${(b+177)%256}, ${(r+63)%256}, ${a ?? 1})`;
  block.walkDecls(d => {
    const fallbackPaint = { '--ds-voice-fallback-saturation': '92', '--ds-voice-fallback-lightness': '50' };
    d.value = (fallbackPaint[d.prop] ?? resolve(d.value)).replace(/#[\da-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)/gi, color => {
      if (color.startsWith('#')) {
        let hex = color.slice(1); if (hex.length < 5) hex = [...hex].map(c=>c+c).join('');
        return shifted(...[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)), hex.length===8?parseInt(hex.slice(6),16)/255:1);
      }
      const parts = color.slice(color.indexOf('(')+1,-1).trim().split(/[,/\s]+/);
      if (/^hsl/i.test(color)) return `hsla(${(parseFloat(parts[0])+150)%360}, 90%, 55%, ${parts[3]??1})`;
      return shifted(...parts.slice(0,3).map(n=>Math.round(parseFloat(n)*(n.endsWith('%')?2.55:1))),parts[3]);
    });
  });
  return block;
}
/** Test-only Vite transform: production receives neither the registry entry nor the block. */
export function themeExtensionPlugin() {
  const resolver = fs.readFileSync('src/design-system/theme/resolver.js','utf8');
  const extended = resolver.replace(']);', `${JSON.stringify(testTheme)}]);`);
  const block = loudThemeBlock(fs.readFileSync('src/design-system/tokens.css','utf8'));
  return {name:'test-only-fourth-theme',enforce:'pre',
    load(id) { if(id.endsWith('/theme/resolver.js?raw'))return `export default ${JSON.stringify(extended)}`; },
    transform(code,id) {
      if(id.endsWith('/theme/resolver.js'))return extended;
      if(id.endsWith('/design-system/app.css'))return code+'\n@layer tokens {'+block.toString()+'}'+(process.env.THEME_PROOF_MUTANT==='hardcoded'?'\nbutton,h1{color:#f00!important}':process.env.THEME_PROOF_MUTANT==='reset'?'\n.ds-reset{text-align:initial!important}':'');
    },
  };
}
