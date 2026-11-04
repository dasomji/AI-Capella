// Offline worker-image check: no database, storage service, API key or network needed.
import { mkdir,mkdtemp,writeFile,rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import assert from 'node:assert/strict';
await mkdir('.transcription-tmp',{recursive:true});const dir=await mkdtemp('.transcription-tmp/pdf-smoke-');
try{
 const pdf=await PDFDocument.create();pdf.addPage([595,842]);pdf.addPage([2400,1200]);await writeFile(dir+'/source',await pdf.save());
 const child=spawnSync('python3',['server/inspection-sandbox.py',process.execPath,'--jitless','--max-old-space-size=192','server/page-render.mjs',JSON.stringify({path:dir+'/source',dir,contentType:'application/pdf',sourcePage:2})],{timeout:16000,encoding:'utf8'});
 assert.equal(child.status,0,child.stderr||String(child.error));const meta=await sharp(dir+'/raster.png').metadata();assert.equal(meta.width,3500);assert.equal(meta.height,1750);assert.equal(meta.format,'png');console.log('PASS: selected PDF page rasterized inside sandbox; 3500x1750 PNG');
}finally{await rm(dir,{recursive:true,force:true});}
