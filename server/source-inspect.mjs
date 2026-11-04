const workerData=JSON.parse(process.argv[2]);
const parentPort={postMessage:value=>process.stdout.write(JSON.stringify(value))};
import { readFile, open } from 'node:fs/promises';
import sharp from 'sharp';
sharp.concurrency(1);sharp.cache(false);
import { PDFDocument } from 'pdf-lib';
try {
 const {path,maxPages,maxPixels}=workerData;
 const f=await open(path,'r');const header=Buffer.alloc(32);await f.read(header,0,32,0);await f.close();
 let type;
 if(header.subarray(0,5).toString()==='%PDF-') type='application/pdf';
 else if(header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) type='image/png';
 else if(header[0]===255 && header[1]===216 && header[2]===255) type='image/jpeg';
 else if(header.toString('ascii',0,4)==='RIFF' && header.toString('ascii',8,12)==='WEBP') type='image/webp';
 else if(header.toString('ascii',4,8)==='ftyp' && /heic|heix|hevc|hevx|mif1|msf1|heif|avif|avis/.test(header.toString('ascii',8))) throw Error('unsupported_image_format');
 else throw Error('invalid_magic');
 let pages=1,width,height;
 if(type==='application/pdf') {
 const bytes=await readFile(path);if(!/%%EOF\s*$/.test(bytes.subarray(-1024).toString('latin1')))throw Error('invalid_source');
 const doc=await PDFDocument.load(bytes,{ignoreEncryption:false,updateMetadata:false});pages=doc.getPageCount();
 if(pages<1 || pages>maxPages) throw Error('page_limit');
 for(const page of doc.getPages()){const s=page.getSize();if(!Number.isFinite(s.width*s.height) || s.width<=0 || s.height<=0 || s.width*s.height>maxPixels) throw Error('pixel_limit');}
 } else {
 const bytes=await readFile(path);
 if(type==='image/png' && !bytes.subarray(-8,-4).equals(Buffer.from('IEND')))throw Error('invalid_source');
 if(type==='image/jpeg' && !(bytes.at(-2)===255 && bytes.at(-1)===217))throw Error('invalid_source');
 if(type==='image/webp' && bytes.readUInt32LE(4)+8!==bytes.length)throw Error('invalid_source');
 const meta=await sharp(path,{limitInputPixels:maxPixels,pages:1}).metadata();width=meta.width;height=meta.height;
 if((meta.pages??1)>1)throw Error('animated_image');
 if(!width || !height || width*height>maxPixels || (meta.pages??1)>1) throw Error('pixel_limit');
 }
 parentPort.postMessage({type,pages,width,height});
} catch(error){const code=error.message;parentPort.postMessage({error:/encrypt/i.test(code)?'encrypted_pdf':['pixel_limit','page_limit','invalid_magic','invalid_source','unsupported_image_format','animated_image'].includes(code)?code:code.includes('pixel')?'pixel_limit':'invalid_source'});}
