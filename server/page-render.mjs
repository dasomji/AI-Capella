import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
const {path,dir,contentType,sourcePage}=JSON.parse(process.argv[2]);
sharp.concurrency(1);sharp.cache(false);
let image=path;
if(contentType==='application/pdf'){
 execFileSync('pdftoppm',['-f',String(sourcePage),'-l',String(sourcePage),'-singlefile','-r','250','-scale-to','3500','-gray','-png',path,dir+'/page'],{timeout:12000,maxBuffer:4096,stdio:'ignore'});image=dir+'/page.png';
}
await sharp(image,{limitInputPixels:40000000,pages:1}).rotate().resize({width:3500,height:3500,fit:'inside',withoutEnlargement:true}).grayscale().normalise().png().toFile(dir+'/raster.png');
