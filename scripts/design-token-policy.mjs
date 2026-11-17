/** Component dimensions compose the shared scale; aliases are never another value source. */
export const maximumTokenNameLength = 48;
export const scaleRole = /^--ds-(?:space-|radius-|size-|leading-|tracking-|stroke-|control-height(?:-|$))/;
export const geometryRole = /^--ds-.*-(?:margin|padding|border-radius|gap|(?:min-|max-)?width|(?:min-|max-)?height|inset)(?:-|$)/;
export const hasUnitlessZero = value => /(?<!\S)0(?!\S)/.test(value);
export function lengthAtoms(value) {
  return [...value.matchAll(/url\((?:[^()'"\n]|'[^']*'|"[^"]*")*\)|'[^']*'|"[^"]*"|(?<![\w-])(-?(?:\d*\.)?\d+)(px|rem|em)\b/g)]
    .filter(m=>m[1]!==undefined).map(m=>({raw:m[0],key:Math.abs(Number(m[1]))+m[2]}));
}
export function scaleSteps(css) {
  const result=new Set();
  css.walkDecls(d=>{if(scaleRole.test(d.prop))for(const atom of lengthAtoms(d.value))result.add(atom.key);});
  return result;
}
export function invalidTokenName(name) {
  return name.startsWith('--')&&(name.slice(2).includes('--')||name.length>maximumTokenNameLength);
}
