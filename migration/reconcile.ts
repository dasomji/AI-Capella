import { JSDOM } from 'jsdom';
import { pool } from '../server/db/index.server';
import { parseMusicXML } from '../src/musicxml';
import { timingFromScore } from '../src/rehearsal/timeline';
import { validateScore } from '../server/score-validation.server';
import { prepare } from './prepare';
import { reportBase } from './import';
import { canonical, type Snapshot } from './snapshot';
export function notation(raw:string,format:string){const dom=new JSDOM('');const previous=globalThis.DOMParser;globalThis.DOMParser=dom.window.DOMParser;try{const s=format==='musicxml'?parseMusicXML(raw):JSON.parse(raw);return {parts:s.parts.length,voices:new Set(s.notes.map((n:any)=>n.partId+':'+(n.voice??''))).size,measures:s.measures.length,notes:s.notes.length,totalBeats:s.totalBeats,timing:timingFromScore(s)};}finally{globalThis.DOMParser=previous;dom.window.close();}}
function differences(actual:any,expected:any,path:string):string[]{
 if(canonical(actual)===canonical(expected))return [];
 if(actual&&expected&&typeof actual==='object'&&typeof expected==='object'&&!Array.isArray(actual)&&!Array.isArray(expected))return [...new Set([...Object.keys(actual),...Object.keys(expected)])].flatMap(k=>differences(actual[k],expected[k],path+'.'+k));
 return [path];
}
export async function reconcile(snapshot:Snapshot){const report=reportBase(snapshot);let mismatches=0;
 const maps=(await pool.query('select * from legacy_import_map where source_project=$1',[snapshot.manifest.project])).rows;const ensembles=new Map(maps.filter(m=>m.collection==='ensembles').map(m=>[m.legacy_id,m.entity_id]));const counts:any={};
 for(const r of snapshot.collections.songs){if(r.data.ensemble==='public'){report.items.push({id:r.id,status:'skipped_public'});continue;}if(!ensembles.has(r.data.ensemble)){report.items.push({id:r.id,status:'quarantined_unassigned'});continue;}let p;try{p=await prepare(r);}catch{report.items.push({id:r.id,status:'quarantined_malformed'});continue;}
 counts[r.data.ensemble]=(counts[r.data.ensemble]??0)+1;const m=maps.find(m=>m.collection==='songs'&&m.legacy_id===r.id);const failures:string[]=[];
 const row=m?(await pool.query('select p.*,v.musicxml,v.native_score,v.content_hash,v.timing from music_pieces p join score_versions v on v.id=p.current_version_id where p.id=$1',[m.entity_id])).rows[0]:null;
 if(!row)failures.push('missing');else{const body=row.format==='musicxml'?row.musicxml:canonical(row.native_score);const actual=await validateScore(body,row.format,true);if(actual.hash!==p.validated.hash||row.content_hash!==actual.hash)failures.push('content_hash');if(row.title!==p.title)failures.push('title');if(row.provenance?.original_bytes_sha256!==p.provenance.original_bytes_sha256)failures.push('provenance.original_bytes_sha256');failures.push(...differences(row.provenance?.legacy_settings,p.provenance.legacy_settings,'provenance.legacy_settings'));if(row.ensemble_id!==ensembles.get(r.data.ensemble))failures.push('ensemble');for(const [k,v] of Object.entries(p.settings))failures.push(...differences(row[k],v,'settings.'+k));if(canonical(notation(p.validated.raw,p.format))!==canonical(notation(body,row.format)))failures.push('notation');if(canonical(row.timing)!==canonical(actual.timing))failures.push('playback_timing');}
 if(failures.length)mismatches++;report.items.push({id:r.id,status:failures.length?'mismatch':'match',failures});}
 for(const [legacy,id] of ensembles){const ensembleMap=maps.find(m=>m.collection==='ensembles'&&m.legacy_id===legacy);const name=(await pool.query('select name from ensembles where id=$1',[id])).rows[0]?.name;if(name!==ensembleMap?.baseline?.name){mismatches++;report.items.push({ensemble:legacy,status:'ensemble_name_mismatch'});}const expected=counts[legacy]??0;const actual=(await pool.query('select count(*)::int as n from music_pieces where ensemble_id=$1',[id])).rows[0].n;const expectedOrder=snapshot.collections.songs.filter(r=>r.data.ensemble===legacy&&report.items.some(i=>i.id===r.id&&['match','mismatch'].includes(i.status))).sort((a,b)=>(a.data.sortKey??a.data.importedAt??0)-(b.data.sortKey??b.data.importedAt??0)||a.id.localeCompare(b.id)).map(r=>r.id);const actualOrder=(await pool.query("select m.legacy_id from music_pieces p join legacy_import_map m on m.entity_id=p.id and m.collection='songs' and m.source_project=$2 where p.ensemble_id=$1 order by p.sort_key collate \"C\",p.id",[id,snapshot.manifest.project])).rows.map(r=>r.legacy_id);const ok=expected===actual&&canonical(expectedOrder)===canonical(actualOrder);if(!ok)mismatches++;report.items.push({ensemble:legacy,status:ok?'ensemble_match':'ensemble_mismatch',expected,actual,expectedOrder,actualOrder});}
 for(const e of snapshot.collections.ensembles)if(e.id!=='public'&&!ensembles.has(e.id)){mismatches++;report.items.push({ensemble:e.id,status:'missing_ensemble'});}
 return {...report,mismatches};
}
