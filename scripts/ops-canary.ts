import { sandboxReady } from "../server/sandbox.server";
import { spawnSync } from "node:child_process";
const sandbox = await sandboxReady();
const poppler = spawnSync("pdftoppm", ["-v"], { stdio: "ignore" }).status === 0;
console.log(
  JSON.stringify({
    at: new Date().toISOString(),
    sandbox,
    poppler,
    uploads: sandbox && poppler,
  }),
);
if (!sandbox || !poppler) process.exitCode = 1;

// Explicit opt-in: never contact an object service during the default sandbox canary.
if (process.argv.includes('--s3')) {
  const keys = ['S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'];
  if (keys.some(key => !process.env[key])) console.log('S3 signed-URL smoke skipped: credentials incomplete');
  else {
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { randomUUID } = await import('node:crypto');
    const client = new S3Client({ endpoint:process.env.S3_ENDPOINT, region:process.env.S3_REGION ?? 'us-east-1', forcePathStyle:process.env.S3_FORCE_PATH_STYLE !== 'false', credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID!,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY!}, requestChecksumCalculation:'WHEN_REQUIRED', requestHandler:{connectionTimeout:5000,requestTimeout:15000} });
    const params = {Bucket:process.env.S3_BUCKET,Key:`ops-canary/${randomUUID()}`};
    const body = 'LightScore signed URL smoke';
    try {
      const upload = await getSignedUrl(client,new PutObjectCommand(params),{expiresIn:60});
      const put = await fetch(upload,{method:'PUT',body,signal:AbortSignal.timeout(15000)});
      if (!put.ok) throw Error(`S3 signed upload failed: ${put.status}`);
      const download = await getSignedUrl(client,new GetObjectCommand(params),{expiresIn:60});
      const get = await fetch(download,{signal:AbortSignal.timeout(15000)});
      if (!get.ok || await get.text() !== body) throw Error('S3 signed download mismatch');
      console.log('S3 signed upload/download passed');
    } finally { await client.send(new DeleteObjectCommand(params));client.destroy(); }
  }
}
