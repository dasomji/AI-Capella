import { gunzipSync } from 'node:zlib';
import { settingsInput, ensembleInput } from '../src/api/domain';
import { pieceTitle } from '../src/api/title';
import { validateScore } from '../server/score-validation.server';
import { env } from '../server/env.server';
import { canonical, hash, type Row } from './snapshot';
export { ensembleInput };
export async function prepare(row:Row){
 const d=row.data;const original=d.xmlGz?Buffer.from(d.xmlGz.$bytes,'base64'):Buffer.from(d.xml??'');
 const raw=d.xmlGz?gunzipSync(original,{maxOutputLength:env.SCORE_MAX_BYTES}).toString('utf8'):d.xml;
 if(typeof raw!=='string'||Buffer.byteLength(raw)>env.SCORE_MAX_BYTES)throw Error('Invalid/oversized body');
 const format=d.format??'musicxml';if(!['musicxml','score'].includes(format))throw Error('Unknown format');
 const validated=await validateScore(raw,format,true);const title=pieceTitle.parse(d.title);
 const settings:any={part_names:null,clef_overrides:null,removed_parts:null,split_parts:null,swing:false,saved_config:null,format_defaults:null}; const unmapped:string[]=[];
 const set=(op:string,key:string|undefined,value:any,column:string)=>{const parsed=settingsInput.safeParse({op,key,value});if(!parsed.success){unmapped.push(op+'.'+(key??''));return;}if(op==='swing')settings.swing=value;else {settings[column]??={};settings[column][key!]=value;}};
 for(const [field,op,col] of [['partNameOverrides','partName','part_names'],['clefOverrides','clef','clef_overrides'],['savedConfig','saved','saved_config']] as const)if(d[field])for(const [k,v] of Object.entries(d[field]))set(op,k,v,col);
 for(const [field,op,col] of [['removedParts','removed','removed_parts'],['splitParts','split','split_parts']] as const)if(d[field]){if(!Array.isArray(d[field]))unmapped.push(field);else for(const k of d[field])set(op,k,true,col);}
 if(d.swing!==undefined)set('swing',undefined,d.swing,'swing');if(d.percussion!==undefined)set('defaults','percussion',d.percussion,'format_defaults');
 const known=['title','xml','xmlGz','format','ensemble','sortKey','importedAt','createdAt','partNameOverrides','clefOverrides','savedConfig','removedParts','splitParts','swing','percussion'];for(const k of Object.keys(d))if(!known.includes(k))unmapped.push(k);
 return {row,raw,format:format as 'musicxml'|'score',title,validated,settings,unmapped,contentHash:hash(canonical(d)),provenance:{legacy_id:row.id,original_bytes_sha256:hash(original),raw_body:validated.raw!==raw?raw:undefined,legacy_settings:Object.fromEntries(Object.entries(d).filter(([k])=>!['xml','xmlGz'].includes(k))),unmapped}};
}
