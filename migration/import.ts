import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../server/db/index.server';
import { transaction, lockEnsemble } from '../server/domain.server';
import { insertVersion } from '../server/migration-content.server';
import { env } from '../server/env.server';
import { mailer } from '../server/mail.server';
import { offsetInstant } from '../server/time.server';
import { prepare, ensembleInput } from './prepare';
import { canonical, hash, type Snapshot } from './snapshot';
export const mappingSchema=z.record(z.string(),z.object({emails:z.array(z.string().trim().toLowerCase().pipe(z.email())).min(1),displayName:z.string().trim().min(1).max(200).optional()}).strict());
export type Mapping=z.infer<typeof mappingSchema>;
export const footprint=(p:any)=>hash(canonical([p.title,p.sort_key,p.format,p.revision,p.current_version_id,p.part_names,p.clef_overrides,p.removed_parts,p.split_parts,p.swing,p.saved_config,p.format_defaults,p.provenance]));
export function reportBase(snapshot:Snapshot){const now=new Date();return {sourceProject:snapshot.manifest.project,snapshot:hash(canonical(snapshot.manifest)),at:now.toISOString(),businessTime:offsetInstant(now),timeZone:env.APP_TIME_ZONE,skipped:Object.fromEntries(Object.entries(snapshot.collections).filter(([k])=>!['ensembles','songs'].includes(k)).map(([k,v])=>[k,{count:v.length,reason:'intentionally not migrated'}])),items:[] as any[],invitations:[] as any[]};}
export async function importSnapshot(snapshot:Snapshot,mapping:Mapping,options:{dryRun?:boolean;sendInvitations?:boolean;applyDeletions?:boolean}={}){
 mapping=mappingSchema.parse(mapping);const report=reportBase(snapshot);const project=snapshot.manifest.project;Object.assign(report,{mappingHash:hash(canonical(mapping))});
 const prepared=new Map<string,Awaited<ReturnType<typeof prepare>>>();const ensembles=snapshot.collections.ensembles.filter(r=>r.path==='ensembles/'+r.id&&r.id!=='public');const ids=new Set(ensembles.map(e=>e.id));
 for(const r of snapshot.collections.songs){if(r.data.ensemble==='public'){report.items.push({id:r.id,status:'skipped_public'});continue;}if(!ids.has(r.data.ensemble)){report.items.push({id:r.id,status:r.data.ensemble?'unknown_ensemble':'orphan',quarantined:true});continue;}try{prepared.set(r.id,await prepare(r));}catch(error){report.items.push({id:r.id,status:'malformed',quarantined:true,error:String(error)});}}
 for(const e of ensembles){const deliveries:any[]=[];const items:any[]=[];try{await transaction(async db=>{
 await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['legacy:'+project+':'+e.id]);
 let map=(await db.query("select * from legacy_import_map where source_project=$1 and collection='ensembles' and legacy_id=$2",[project,e.id])).rows[0];
 const name=ensembleInput.parse({name:mapping[e.id]?.displayName??e.data.name}).name;
 if(!map){const entity=(await db.query('insert into ensembles(name,awaiting_lead) values($1,true) returning id',[name])).rows[0];map={entity_id:entity.id};await db.query("insert into legacy_import_map(source_project,collection,legacy_id,entity_id,content_hash,baseline) values($1,'ensembles',$2,$3,$4,$5)",[project,e.id,entity.id,hash(canonical(e.data)),JSON.stringify({name})]);}
 await lockEnsemble(db,map.entity_id);const ensemble=map.entity_id;
 const existingEnsemble=(await db.query('select name from ensembles where id=$1',[ensemble])).rows[0];
 if(map.baseline && existingEnsemble.name!==map.baseline.name){items.push({ensemble:e.id,status:'conflict',field:'ensemble_name'});}
 else if(map.baseline && (name!==map.baseline.name||map.content_hash!==hash(canonical(e.data)))){await db.query('update ensembles set name=$1 where id=$2',[name,ensemble]);await db.query("update legacy_import_map set content_hash=$1,baseline=$2,updated_at=now() where id=$3",[hash(canonical(e.data)),JSON.stringify({name}),map.id]);}

 const leads=(await db.query('select count(*)::int as n from memberships where ensemble_id=$1 and is_lead',[ensemble])).rows[0].n;
 if(!leads)items.push({ensemble:e.id,status:'awaiting_lead',mappingMissing:!mapping[e.id]});
 for(const email of new Set(mapping[e.id]?.emails??[])){
 const existing=(await db.query('select * from invitations where ensemble_id=$1 and email=$2',[ensemble,email])).rows;
 if(existing.some(i=>i.state==='accepted')||existing.some(i=>i.state==='pending')&&!options.sendInvitations)continue;
 if(existing.some(i=>i.state==='pending'&&i.kind!=='lead'))throw Error('Existing member invitation conflicts with mapping');
 const raw=randomBytes(32).toString('base64url');await db.query("update invitations set state='revoked',revoked_at=now() where ensemble_id=$1 and email=$2 and state='pending'",[ensemble,email]);
 const inv=(await db.query("insert into invitations(ensemble_id,email,kind,token_hash,expires_at) values($1,$2,'lead',$3,$4) returning id",[ensemble,email,hash(raw),new Date(Date.now()+336*3600000)])).rows[0];deliveries.push({id:inv.id,email,url:env.BETTER_AUTH_URL+'/invite/'+raw,ensemble:e.id});
 }
 const songs=[...prepared.values()].filter(p=>p.row.data.ensemble===e.id).sort((a,b)=>(a.row.data.sortKey??a.row.data.importedAt??0)-(b.row.data.sortKey??b.row.data.importedAt??0)||a.row.id.localeCompare(b.row.id));
 for(const [index,p] of songs.entries()){
 const key=String(index).padStart(12,'0');const old=(await db.query("select * from legacy_import_map where source_project=$1 and collection='songs' and legacy_id=$2 for update",[project,p.row.id])).rows[0];
 let current=old?(await db.query('select * from music_pieces where id=$1',[old.entity_id])).rows[0]:null;
 if(old&&(!current||current.ensemble_id!==ensemble||footprint(current)!==old.baseline?.fingerprint)){items.push({id:p.row.id,status:'conflict'});continue;}
 if(old&&old.content_hash===p.contentHash&&current.sort_key===key){items.push({id:p.row.id,status:'unchanged'});continue;}
 if(!current)current=(await db.query('insert into music_pieces(ensemble_id,title,sort_key,format) values($1,$2,$3,$4) returning *',[ensemble,p.title,key,p.format])).rows[0];
 const n=(await db.query('select coalesce(max(version_no),0)::int+1 as n from score_versions where piece_id=$1',[current.id])).rows[0].n;
 if(!old||old.content_hash!==p.contentHash)await insertVersion(db,ensemble,current.id,null,n,{format:p.format,schemaVersion:1},p.validated);
 const s=p.settings;current=(await db.query('update music_pieces set title=$2,sort_key=$3,part_names=$4,clef_overrides=$5,removed_parts=$6,split_parts=$7,swing=$8,saved_config=$9,format_defaults=$10,provenance=$11,revision=revision+$12 where id=$1 returning *',[current.id,p.title,key,s.part_names,s.clef_overrides,s.removed_parts,s.split_parts,s.swing,s.saved_config,s.format_defaults,JSON.stringify(p.provenance),old?1:0])).rows[0];
 await db.query("insert into legacy_import_map(source_project,collection,legacy_id,entity_id,content_hash,imported_revision,baseline) values($1,'songs',$2,$3,$4,$5,$6) on conflict(source_project,collection,legacy_id) do update set content_hash=excluded.content_hash,imported_revision=excluded.imported_revision,baseline=excluded.baseline,updated_at=now()",[project,p.row.id,current.id,p.contentHash,current.revision,JSON.stringify({fingerprint:footprint(current)})]);
 await db.query("insert into audit_events(ensemble_id,action,target_id,outcome,metadata) values($1,'migration.import',$2,'ok',$3)",[ensemble,current.id,JSON.stringify({legacyId:p.row.id,snapshot:report.snapshot})]);items.push({id:p.row.id,status:old?'updated':'created',unmapped:p.unmapped});
 }
 const present=new Set(snapshot.collections.songs.map(s=>s.id));const prior=(await db.query("select m.*,p.ensemble_id from legacy_import_map m join music_pieces p on p.id=m.entity_id where m.source_project=$1 and m.collection='songs' and p.ensemble_id=$2",[project,ensemble])).rows;
 for(const old of prior)if(!present.has(old.legacy_id)){const p=(await db.query('select * from music_pieces where id=$1',[old.entity_id])).rows[0];if(footprint(p)!==old.baseline?.fingerprint){items.push({id:old.legacy_id,status:'deletion_conflict'});continue;}items.push({id:old.legacy_id,status:'deleted_in_legacy',applied:!!options.applyDeletions});if(options.applyDeletions){await db.query("insert into audit_events(ensemble_id,action,target_id,outcome,metadata) values($1,'migration.delete',$2,'ok',$3)",[ensemble,p.id,JSON.stringify({legacyId:old.legacy_id,snapshot:report.snapshot})]);await db.query('update music_pieces set current_version_id=null where id=$1',[p.id]);await db.query('delete from score_versions where piece_id=$1',[p.id]);await db.query('delete from music_pieces where id=$1',[p.id]);await db.query('delete from legacy_import_map where id=$1',[old.id]);}}
 if(options.dryRun){await db.query('set constraints all immediate');throw new Error('DRY_RUN_ROLLBACK');}
 });}catch(error){if(!(options.dryRun&&String(error)==='Error: DRY_RUN_ROLLBACK')){report.items.push({ensemble:e.id,status:'ensemble_failed',error:String(error)});continue;}}
 report.items.push(...items);for(const delivery of deliveries){if(options.dryRun){report.invitations.push({email:delivery.email,ensemble:e.id,status:'would_create'});continue;}if(options.sendInvitations){try{await mailer.send({to:delivery.email,subject:'LightScore – ensemble lead invitation',text:delivery.url,idempotencyKey:'migration-'+delivery.id});await pool.query("update invitations set delivery_state='sent',send_count=send_count+1,last_sent_at=now() where id=$1",[delivery.id]);report.invitations.push({email:delivery.email,status:'sent'});}catch{report.invitations.push({email:delivery.email,status:'delivery_failed'});}}else report.invitations.push({...delivery,status:'not_sent'});}
 }
 return report;
}
