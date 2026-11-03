/** Treat renderer output as untrusted: member-controlled notation can reach SVG labels. */
export function safeSvg(text: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || parsed.querySelector('parsererror')) throw new Error('Invalid SVG');
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (['script', 'foreignobject', 'iframe', 'object', 'embed', 'animate', 'set'].includes(el.localName.toLowerCase())) { el.remove(); continue; }
    if(el.localName === 'style' && /@import|expression\s*\(|(?:javascript|vbscript):|url\(\s*(?!['"]?#)/i.test(el.textContent ?? '')) {el.remove();continue;}
    for (const attr of [...el.attributes]) {
      const name = attr.localName.toLowerCase(), value = attr.value.replace(/[\u0000-\u0020]/g, '').toLowerCase();
      if (name.startsWith('on') || name === 'base' || ((name === 'href' || name === 'src') && !value.startsWith('#')) || /(?:javascript|vbscript):|url\((?!['"]?#)/i.test(value)) el.removeAttributeNode(attr);
    }
  }
  return document.importNode(root, true) as unknown as SVGSVGElement;
}
