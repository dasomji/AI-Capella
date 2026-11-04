import { cleanMusicXML,normalizeTimewise } from './musicxml-input.mjs';
import { parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { tsImport } from 'tsx/esm/api';
const { timingFromScore } = await tsImport('../src/rehearsal/timeline.ts', import.meta.url);
const { contentInput } = await tsImport('../src/api/domain.ts', import.meta.url);
function canonical(value, depth=0) {
  if(depth>64) throw Error('nesting_limit');
  if(typeof value==='string' && (value.includes('\0') || !value.isWellFormed())) throw Error('invalid_text');
  if(value && typeof value==='object' && Object.keys(value).some(k=>k.includes('\0') || !k.isWellFormed())) throw Error('invalid_text');
  if(Array.isArray(value)) return '['+value.map(v=>canonical(v,depth+1)).join(',')+']';
  if(value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],depth+1)).join(',')+'}';
  return JSON.stringify(value);
}
parentPort.on('message', async ({raw,format,timing})=>{
  try {
    if(raw.includes('\0')) throw Error('invalid_text');
    let body=raw;
    if(format==='score') {
      body=JSON.parse(raw);
      canonical(body); // Bound nesting before schema traversal.
      contentInput.parse({format,schemaVersion:1,body});
      raw=canonical(body);

    } else {
      raw=cleanMusicXML(raw);
      if(XMLValidator.validate(raw)!==true) throw Error('invalid_xml');
      const parsed=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(raw);
      const roots=Object.keys(parsed).filter(k=>!k.startsWith('?') && k!=='!DOCTYPE');
      if(roots.length!==1 || !(parsed['score-partwise'] || parsed['score-timewise'])) throw Error('invalid_xml');
      const visit=(v,part=false,depth=0)=>{
        if(depth>256) throw Error('nesting_limit');
        return !!v && typeof v==='object' && Object.entries(v).some(([k,c])=>(part && k==='note') || visit(c,part || k==='part',depth+1));
      };
      if(!visit(parsed)) throw Error('empty_score');
    }
    let validation;
    if(format==='musicxml'){
      const {JSDOM}=await import('jsdom');const dom=new JSDOM(raw,{contentType:'text/xml'});
      if(dom.window.document.documentElement.tagName==='score-timewise'){normalizeTimewise(dom.window.document);raw=dom.window.document.documentElement.outerHTML;}
      const {validateMusicDocument}=await tsImport('../src/score-validation.ts',import.meta.url);
      validation=validateMusicDocument(dom.window.document);dom.window.close();
      if(!validation.structurallyValid)throw Error('invalid_score');
    }
    let derived;
    if(timing){
      let score=body;
      if(format==='musicxml'){const {JSDOM}=await import('jsdom');const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;const {parseMusicXML}=await tsImport('../src/musicxml.ts',import.meta.url);score=parseMusicXML(raw);dom.window.close();}
      derived=timingFromScore(score);
    }
    parentPort.postMessage({validation,timing:derived,raw,hash:createHash('sha256').update(raw).digest('hex'),size:Buffer.byteLength(raw)});
  } catch(error) { parentPort.postMessage({error:['invalid_text','invalid_xml','empty_score','nesting_limit'].includes(error.message)?error.message:'invalid_score'}); }
});
