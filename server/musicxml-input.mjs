/** No DTD is fetched or expanded. Only external declarations without subsets are accepted. */
export function cleanMusicXML(input, fences=false) {
 let xml=input.trim();
 if(fences)xml=xml.replace(/^```(?:xml|musicxml)?\s*\n([\s\S]*?)\n```$/i,'$1').trim();
 if(/<!ENTITY/i.test(xml))throw Error('invalid_xml');
 xml=xml.replace(/<!DOCTYPE\s+(?:score-partwise|score-timewise)\s+(?:PUBLIC\s+(?:"[^"]*"|'[^']*')\s+|SYSTEM\s+)(?:"[^"\[\]]*"|'[^'\[\]]*')\s*>/gi,'');
 if(/<!DOCTYPE/i.test(xml))throw Error('invalid_xml');
 return xml.trim();
}

export function normalizeTimewise(doc){
 if(doc.documentElement.tagName!=='score-timewise')return;
 const old=doc.documentElement, root=doc.createElement('score-partwise');
        root.setAttribute('version',old.getAttribute('version')??'4.0');
        for(const child of Array.from(old.children))if(child.tagName!=='measure')root.append(child.cloneNode(true));
        for(const declaration of Array.from(root.querySelectorAll('part-list > score-part'))){const part=doc.createElement('part');part.id=declaration.id;for(const m of Array.from(old.children).filter(c=>c.tagName==='measure')){const measure=doc.createElement('measure');for(const a of m.attributes)measure.setAttribute(a.name,a.value);const local=Array.from(m.children).find(p=>p.id===part.id);if(local)for(const child of Array.from(local.children))measure.append(child.cloneNode(true));part.append(measure);}root.append(part);}
        old.replaceWith(root);

}
