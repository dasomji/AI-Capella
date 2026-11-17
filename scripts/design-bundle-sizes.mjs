/** Measure the actual JS/CSS requests made by the built sign-in and app routes. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
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
  const response=await page.goto(`http://localhost:${server.address().port}${route}`);
  const html=await response.text();
  const ssrStyles=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(m=>m[1]);
  if(process.env.SIZE_ASSERT_SPLIT==='1'){
    assert.ok(ssrStyles[0]?.includes('/app-'),'Foundation must be SSR-linked first');
    assert.equal(ssrStyles.some(url=>url.includes('/workspace-')),route==='/app','App CSS must be SSR-linked exactly on /app');
    for(const style of ssrStyles)assert.ok(html.indexOf(style)<html.indexOf('<script'),'CSS must precede theme bootstrap and hydration');
  }
  await page.locator(route==='/'?'form input[type=email]':'#landing-empty').waitFor({state:'attached'});
  await page.waitForLoadState('networkidle');
  const sizes={route,ssrStyles,jsRaw:0,jsGzip:0,cssRaw:0,cssGzip:0,assets:[]};
  for(const asset of [...assets].sort()) {
   const body=await fs.readFile(path.join(build,'client',asset));const type=asset.endsWith('.js')?'js':'css';
   sizes[type+'Raw']+=body.length;sizes[type+'Gzip']+=gzipSync(body).length;sizes.assets.push({asset,raw:body.length,gzip:gzipSync(body).length});
  }
  rows.push(sizes);await context.close();
 }
 if(process.env.SIZE_ASSERT_SPLIT==='1'){
  const css=rows[1].assets.filter(a=>a.asset.endsWith('.css')).map(a=>a.asset);
  assert.equal(css.length,2);
  const offline=await fs.readFile(path.join(build,'client/offline.html'),'utf8');
  assert.ok(offline.indexOf(css[0])>=0&&offline.indexOf(css[1])>offline.indexOf(css[0]),'Offline CSS order must match SSR');
  const sw=await fs.readFile(path.join(build,'client/sw.js'),'utf8');for(const file of css)assert.ok(sw.includes(file),'SW precaches '+file);
  for(const r of rows)for(const a of r.assets.filter(a=>a.asset.endsWith('.css')))assert.ok(!(await fs.readFile(path.join(build,'client',a.asset),'utf8')).includes('--ds-panel-specimen-transform'));
  const eager=await Promise.all(rows[0].assets.filter(a=>a.asset.endsWith('.js')).map(a=>fs.readFile(path.join(build,'client',a.asset),'utf8')));
  for(const hook of ['ds-player-button','ds-library-song-card','ds-panel-stepper'])assert.ok(eager.every(js=>!js.includes(hook)),'Auth graph excludes '+hook);
 }
 console.log(JSON.stringify({build,rows},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
