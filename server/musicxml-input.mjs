/** No DTD is fetched or expanded. Only external declarations without subsets are accepted. */
export function cleanMusicXML(input, fences=false) {
 let xml=input.trim();
 if(fences)xml=xml.replace(/^```(?:xml|musicxml)?\s*\n([\s\S]*?)\n```$/i,'$1').trim();
 if(/<!ENTITY/i.test(xml))throw Error('invalid_xml');
 xml=xml.replace(/<!DOCTYPE\s+(?:score-partwise|score-timewise)\s+(?:PUBLIC\s+(?:"[^"]*"|'[^']*')\s+|SYSTEM\s+)(?:"[^"\[\]]*"|'[^'\[\]]*')\s*>/gi,'');
 if(/<!DOCTYPE/i.test(xml))throw Error('invalid_xml');
 return xml.trim();
}
