/** Entirely original synthetic exercises, dedicated to CC0. No source score is copied. */
import { mkdir,writeFile } from 'node:fs/promises';
import createModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
const toolkit=new VerovioToolkit(await createModule());
for(const [id,names,kind] of [['satb',['Soprano','Alto','Tenor','Bass'],'vocal'],['divisi-piano',['Soprano I','Soprano II','Alto','Tenor','Bass','Piano'],'vocal'],['band',['Flute','Clarinet','Trumpet','Trombone'],'instrumental'],['round',['Soprano','Alto','Tenor','Bass'],'vocal']] as const){
 const dir=`eval/fixtures/${id}`;await mkdir(dir,{recursive:true});
 const measures=(name:string)=>Array.from({length:8},(_,i)=>`<measure number="${i+1}">${i===0?'<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':''}${i===4?'<print new-page="yes"/>':''}<note><pitch><step>${['C','D','E','F'][i%4]}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type>${kind==='vocal'&&!name.includes('Piano')?'<lyric><syllabic>single</syllabic><text>la</text></lyric>':''}</note></measure>`).join('');
 let xml=`<score-partwise version="4.0"><work><work-title>Synthetic ${id}</work-title></work><part-list>${names.map((name,i)=>`<score-part id="P${i+1}"><part-name>${name}</part-name></score-part>`).join('')}</part-list>${names.map((name,i)=>`<part id="P${i+1}">${measures(name)}</part>`).join('')}</score-partwise>`;
 if(id==='round'){
 // Original bundled four-part study: two voices per part, two verses, ties and repeat.
 xml=xml.replace(/<note>[\s\S]*?<\/note>/g,(n)=>n.replace('<duration>4</duration>','<duration>2</duration>').replace('<type>whole</type>','<type>half</type><tie type="start"/>').replace('<text>la</text>','<text>Light</text>')+'<note>'+n.match(/<pitch>[\s\S]*?<\/pitch>/)![0]+'<duration>2</duration><voice>1</voice><type>half</type><tie type="stop"/><lyric number="2"><syllabic>single</syllabic><text>Sing</text></lyric></note><backup><duration>4</duration></backup><note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type></note>');
 xml=xml.replaceAll('<measure number="1">','<measure number="1"><barline location="left"><repeat direction="forward"/></barline>').replaceAll('<measure number="4">','<measure number="4"><barline location="right"><ending number="1" type="start"/><repeat direction="backward"/></barline>');
 await mkdir('eval/samples',{recursive:true});await writeFile('eval/samples/round.musicxml',xml);
 }
 await writeFile(`${dir}/reference.musicxml`,xml);
 toolkit.setOptions({inputFrom:'musicxml',pageWidth:2100,pageHeight:2970,scale:40,breaks:'encoded'});if(!toolkit.loadData(xml))throw Error(toolkit.getLog());
 const pdf=await PDFDocument.create();const pages=[];
 for(let p=1;p<=toolkit.getPageCount();p++){
 const png=await sharp(Buffer.from(toolkit.renderToSVG(p)),{density:160}).flatten({background:'white'}).png().toBuffer();
 await writeFile(`${dir}/raster-${p}.png`,png);
 const image=await pdf.embedPng(png);const page=pdf.addPage([595,842]);page.drawImage(image,{x:0,y:0,width:595,height:842});
 // Deterministic skew, blur, low resolution and seeded sensor noise simulate an imperfect phone photo.
 let seed=42;const noise=Buffer.alloc(900*1200*3);for(let n=0;n<noise.length;n++){seed=(1664525*seed+1013904223)>>>0;noise[n]=225+(seed%31);}
 const photo=await sharp(png).resize(900,1200,{fit:'fill'}).affine([[1,.025],[.01,1]],{background:'white'}).rotate(2,{background:'white'}).resize(900,1200).blur(.7).composite([{input:noise,raw:{width:900,height:1200,channels:3},blend:'multiply',}]).jpeg({quality:65}).toBuffer();
 await writeFile(`${dir}/photo-${p}.jpg`,photo);
 await sharp(photo).png().toFile(`${dir}/photo-raster-${p}.png`);
 const fragment=xml.replace(/<measure number="(\d+)">[\s\S]*?<\/measure>/g,(m,n)=>Number(n)>=(p-1)*4+1&&Number(n)<=p*4?m:'');
 await writeFile(`${dir}/page-${p}.musicxml`,fragment);pages.push({source:'original.pdf',contentType:'application/pdf',sourcePage:p,recordedRaster:`raster-${p}.png`,reference:`page-${p}.musicxml`,recorded:{musicxml:fragment,uncertainties:[],flags:[]}});
 }
 await writeFile(`${dir}/original.pdf`,await pdf.save());
 await writeFile(`${dir}/manifest.json`,JSON.stringify({id,license:'CC0-1.0',metadata:{kind,divisi:id==='divisi-piano',accompaniment:id==='divisi-piano',lyrics:kind==='vocal',photoQuality:'synthetic degraded'},reference:'reference.musicxml',pages},null,2)+'\n');
 // Separate job evaluates the photos, with identical notation references.
 await writeFile(`${dir}/photos.json`,JSON.stringify({...JSON.parse(await (await import('node:fs/promises')).readFile(`${dir}/manifest.json`,'utf8')),id:id+'-photos',pages:pages.map((p,i)=>({...p,source:`photo-${i+1}.jpg`,recordedRaster:`photo-raster-${i+1}.png`,contentType:'image/jpeg',sourcePage:1}))},null,2)+'\n');
}
