/** Measure the actual JS/CSS requests made by the built sign-in and app routes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
const build=path.resolve(process.env.SIZE_BUILD_ROOT??'dist');
const entry=(await import(pathToFileURL(path.join(build,'server/server.js')).href)).default;
const server=createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/assets/')) {
   const file=path.join(build,'client',url.pathname),body=await fs.readFile(file);
   res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(body);return;
  }
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{}');return;}
  const response=await entry.fetch(new Request(`http://localhost:${server.address().port}${req.url}`));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.statusCode=500;res.end(String(error));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({args:['--no-sandbox']});const rows=[];
try {
 for(const route of ['/','/app']) {
  const context=await browser.newContext();const page=await context.newPage(),assets=new Set();
  await page.addInitScript(()=>{localStorage.setItem('ai-capella-lang','en');localStorage.setItem('ai-capella-intro-off','1');});
  page.on('response',response=>{const u=new URL(response.url());if(u.pathname.startsWith('/assets/')&&/\.(js|css)$/.test(u.pathname))assets.add(u.pathname);});
  await page.route('**/api/**',route=>{
   const u=new URL(route.request().url());let data=[];
   if(u.pathname==='/api/me')data={user:{id:'fixture',email:'user@test.com',name:'Test User'}};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.routeWebSocket('**',ws=>ws.close());
  await page.goto(`http://localhost:${server.address().port}${route}`);
  await page.locator(route==='/'?'form input[type=email]':'#landing-empty').waitFor({state:'attached'});
  await page.waitForLoadState('networkidle');
  const sizes={route,jsRaw:0,jsGzip:0,cssRaw:0,cssGzip:0,assets:[]};
  for(const asset of [...assets].sort()) {
   const body=await fs.readFile(path.join(build,'client',asset));const type=asset.endsWith('.js')?'js':'css';
   sizes[type+'Raw']+=body.length;sizes[type+'Gzip']+=gzipSync(body).length;sizes.assets.push({asset,raw:body.length,gzip:gzipSync(body).length});
  }
  rows.push(sizes);await context.close();
 }
 console.log(JSON.stringify({build,rows},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
