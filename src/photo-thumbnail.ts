/** Decode and resize off the main thread where the browser supports it. */
export async function photoThumbnail(file:File):Promise<Blob>{
 const bitmap=await createImageBitmap(file,{resizeWidth:200,resizeQuality:'low'});
 try{
  const height=Math.max(1,Math.round(200*bitmap.height/bitmap.width));
  if(typeof OffscreenCanvas!=='undefined'){const canvas=new OffscreenCanvas(200,height);canvas.getContext('2d')!.drawImage(bitmap,0,0,200,height);return await canvas.convertToBlob({type:'image/webp',quality:.75});}
  const canvas=document.createElement('canvas');canvas.width=200;canvas.height=height;canvas.getContext('2d')!.drawImage(bitmap,0,0,200,height);return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('thumbnail')),'image/jpeg',.75));
 }finally{bitmap.close();}
}
