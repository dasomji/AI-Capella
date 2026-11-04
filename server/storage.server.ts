import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import { env } from './env.server';
export interface ObjectStorage {
  put(key:string,body:Readable,size:number,type:string):Promise<void>;
  get(key:string):Promise<Readable>;
  head(key:string):Promise<{size:number;type?:string}>;
  delete(key:string):Promise<void>;
  signedGet(key:string,seconds?:number,filename?:string):Promise<string>;
}
export class S3Storage implements ObjectStorage {
  private client:S3Client;
  constructor(private bucket=env.S3_BUCKET) {
    if(!bucket || !env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) throw Error('S3 configuration required');
    this.client=new S3Client({endpoint:env.S3_ENDPOINT,region:env.S3_REGION,forcePathStyle:env.S3_FORCE_PATH_STYLE,requestChecksumCalculation:'WHEN_REQUIRED',credentials:{accessKeyId:env.S3_ACCESS_KEY_ID,secretAccessKey:env.S3_SECRET_ACCESS_KEY},requestHandler:{requestTimeout:30000}});
  }
  async initialize(){
    try {await this.client.send(new HeadBucketCommand({Bucket:this.bucket}));}
    catch(error){if(env.NODE_ENV!=='development' || (error as {$metadata?:{httpStatusCode:number}}).$metadata?.httpStatusCode!==404) throw error; await this.client.send(new CreateBucketCommand({Bucket:this.bucket}));}
  }
  async put(key:string,body:Readable,size:number,type:string){await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:body,ContentLength:size,ContentType:type}));}
  async get(key:string){const r=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}));return r.Body as Readable;}
  async head(key:string){const r=await this.client.send(new HeadObjectCommand({Bucket:this.bucket,Key:key}));return {size:r.ContentLength!,type:r.ContentType};}
  async delete(key:string){await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:key}));}
  signedGet(key:string,seconds=60,filename='original'){return getSignedUrl(this.client,new GetObjectCommand({Bucket:this.bucket,Key:key,ResponseContentDisposition:`attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,ResponseContentType:'application/octet-stream'}),{expiresIn:Math.max(1,Math.min(60,seconds))});}
}
let instance:S3Storage|undefined;
export function storage(){return instance ??=new S3Storage();}
