import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { collections, encode, writeSnapshot } from '../../migration/snapshot';
export async function exportSnapshot(options:{project:string;credentials?:string;out:string;productionAcknowledged?:boolean}){
 const emulator=process.env.FIRESTORE_EMULATOR_HOST;
 if(!emulator&&!options.productionAcknowledged)throw Error('Non-emulator export requires --i-understand-this-reads-production');
 if(emulator&&!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulator))throw Error('Emulator must be loopback');
 if(emulator&&options.project==='ai-capella')throw Error('Use a demo project for emulator tests');
 if(!emulator&&!options.credentials)throw Error('--credentials is required outside the emulator');
 const app=initializeApp({projectId:options.project,...(!emulator?{credential:cert(JSON.parse(await readFile(options.credentials!,'utf8')))}:{})},'migration-'+Date.now());
 try {const db=getFirestore(app);const startedAt=new Date().toISOString();
 // A single read-only transaction pins all queries to one Firestore snapshot.
 const result=await db.runTransaction(async tx=>{const data:any={};let readTime:string|null=null;for(const name of collections){const q=await tx.get(db.collection(name));data[name]=q.docs.map(d=>({id:d.id,path:d.ref.path,data:encode(d.data())}));readTime=q.readTime.toDate().toISOString();if(name==='members'||name==='leaders'){// Parents may be absent even though their subcollections exist.
 const children=await tx.get(db.collectionGroup('ensembles'));data[name]=children.docs.filter(d=>d.ref.path.startsWith(name+'/')).map(d=>({id:d.id,path:d.ref.path,data:encode(d.data())}));}}
 return {data,readTime};},{readOnly:true});return await writeSnapshot(options.out,options.project,result.data,startedAt,result.readTime);
 }finally{await deleteApp(app);}
}
if(process.argv[1]?.endsWith('/export.ts')){const {values:v}=parseArgs({options:{project:{type:'string'},credentials:{type:'string'},out:{type:'string'},'i-understand-this-reads-production':{type:'boolean'}}});if(!v.project||!v.out)throw Error('--project and --out required');await exportSnapshot({project:v.project,credentials:v.credentials,out:v.out,productionAcknowledged:v['i-understand-this-reads-production']});}
