const SVG = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
// Observed in Verovio 6.3 output for the bundled score; geometric peers cover other notation.
const elements = new Set('svg defs desc title g path ellipse circle polygon polyline rect line text tspan use style'.split(' '));
const attributes = new Set('id class version viewBox overflow width height x y x1 y1 x2 y2 cx cy r rx ry d points transform color fill fill-opacity stroke stroke-opacity stroke-linecap stroke-linejoin stroke-width opacity font-family font-size font-weight font-style text-anchor dominant-baseline dx dy rotate letter-spacing'.split(' '));
const rules = '#SCORE g.ending, #SCORE g.fing, #SCORE g.reh, #SCORE g.tempo {font-weight:bold;}#SCORE g.dir, #SCORE g.dynam, #SCORE g.mNum {font-style:italic;}#SCORE g.label {font-weight:normal;}#SCORE ellipse, #SCORE path, #SCORE polygon, #SCORE polyline, #SCORE rect {stroke:currentColor}#SCORE g.cursor {fill:dodgerblue; color:dodgerblue;}#SCORE g.cursor.chord {fill:limegreen; color:limegreen;}';
function rendererStyle(text: string, id: string) {
  if (/^[A-Za-z][\w-]*$/.test(id) && text.split('#' + id).join('#SCORE') === rules) return true;
  return /^@font-face\s*\{\s*font-family:\s*'(?:Leipzig|Bravura|LightScoreEngraving)';\s*src:\s*url\(data:application\/font-woff2;charset=utf-8;base64,[A-Za-z0-9+/=]+\)\s*format\('woff2'\);\s*font-weight:\s*normal;\s*font-style:\s*normal;\s*\}$/.test(text);
}
function decodeCss(text: string) {
  return text.replace(/\\([0-9a-f]{1,6})\s?|\\([^\n\r\f])/gi, (_, hex, char) => hex ? String.fromCodePoint(Math.min(parseInt(hex,16),0x10ffff)) : char).replace(/\/\*[\s\S]*?\*\//g,'').replace(/[\u0000-\u0020]/g,'');
}
/** Parse inertly; only notation geometry, text and internal glyph references cross this boundary. */
export function safeSvg(text: string): SVGSVGElement {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Invalid SVG');
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== SVG || parsed.querySelector('parsererror')) throw new Error('Invalid SVG');
  const id=root.getAttribute('id') ?? '';
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el.namespaceURI !== SVG || !elements.has(el.localName)) {el.remove();continue;}
    if (el.localName === 'style') {
      if (!rendererStyle(el.textContent ?? '',id)) {el.remove();continue;}
    }
    for (const attr of [...el.attributes]) {
      const name=attr.localName;
      if (attr.namespaceURI === 'http://www.w3.org/2000/xmlns/') {
        if (!((attr.name==='xmlns' && attr.value===SVG)||(attr.name==='xmlns:xlink' && attr.value===XLINK))) el.removeAttributeNode(attr);
        continue;
      }
      if (name==='type' && !attr.namespaceURI && el.localName==='style' && attr.value==='text/css') continue;
      if (name==='href' && (!attr.namespaceURI || attr.namespaceURI===XLINK) && el.localName==='use' && /^#[A-Za-z_][\w:.-]*$/.test(attr.value)) continue;
      if (attr.namespaceURI || !attributes.has(name) || /url\(|(?:javascript|vbscript):|expression\(/i.test(decodeCss(attr.value))) el.removeAttributeNode(attr);
    }
  }
  return document.importNode(root, true) as unknown as SVGSVGElement;
}
