import { openSync,closeSync,readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
const {path,dir,contentType,sourcePage}=JSON.parse(process.argv[2]);
sharp.concurrency(1);sharp.cache(false);
try{
let image=path;
if(contentType==='application/pdf'){
 const stderr=openSync(dir+'/renderer-stderr','w');try{execFileSync('pdftoppm',['-f',String(sourcePage),'-l',String(sourcePage),'-singlefile','-r','250','-scale-to','3500','-gray','-png',path,dir+'/page'],{timeout:12000,maxBuffer:4096,stdio:['ignore','ignore',stderr]});}catch(error){error.stderr=readFileSync(dir+'/renderer-stderr','utf8').slice(0,4096);throw error;}finally{closeSync(stderr);}image=dir+'/page.png';
}
await sharp(image,{limitInputPixels:40000000,pages:1}).rotate().resize({width:3500,height:3500,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).grayscale().normalise().png().toFile(dir+'/raster.png');

}catch(error){console.error(JSON.stringify({code:error.code??'render_failed',stderr:String(error.stderr??error.message).slice(0,4096)}));process.exit(error.code==='ENOENT'?70:65);}
