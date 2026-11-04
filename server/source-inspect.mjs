import { parentPort, workerData } from 'node:worker_threads';
import { readFile, open } from 'node:fs/promises';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
try {
 const {path,maxPages,maxPixels}=workerData;
 const f=await open(path,'r');const header=Buffer.alloc(32);await f.read(header,0,32,0);await f.close();
 let type;
 if(header.subarray(0,5).toString()==='%PDF-') type='application/pdf';
 else if(header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) type='image/png';
 else if(header[0]===255 && header[1]===216 && header[2]===255) type='image/jpeg';
 else if(header.toString('ascii',0,4)==='RIFF' && header.toString('ascii',8,12)==='WEBP') type='image/webp';
 else if(header.toString('ascii',4,8)==='ftyp' && /heic|heix|hevc|hevx|mif1/.test(header.toString('ascii',8))) type='image/heic';
 else throw Error('invalid_magic');
 let pages=1,width,height;
 if(type==='application/pdf') {
 const doc=await PDFDocument.load(await readFile(path),{ignoreEncryption:false,updateMetadata:false});pages=doc.getPageCount();
 if(pages<1 || pages>maxPages) throw Error('page_limit');
 for(const page of doc.getPages()){const s=page.getSize();if(!Number.isFinite(s.width*s.height) || s.width<=0 || s.height<=0 || s.width*s.height>maxPixels) throw Error('pixel_limit');}
 } else {
 const meta=await sharp(path,{limitInputPixels:maxPixels,pages:1}).metadata();width=meta.width;height=meta.height;
 if(!width || !height || width*height>maxPixels || (meta.pages??1)>1) throw Error('pixel_limit');
 }
 parentPort.postMessage({type,pages,width,height});
} catch(error){parentPort.postMessage({error:error.message.includes('pixel')?'pixel_limit':error.message==='page_limit'?'page_limit':error.message==='invalid_magic'?'invalid_magic':'invalid_source'});}
