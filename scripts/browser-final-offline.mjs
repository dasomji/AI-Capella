import pg from 'pg';
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import { captureDesign } from "./browser-design.mjs";
import { assertPlayerContrast } from "./browser-themes.mjs";
const base = process.env.BROWSER_BASE || "http://localhost:3000",
  evidence =
    '/tmp/aicap-final-polish';
fs.mkdirSync(`${evidence}/shots`, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox"],
});
const a = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
  }),
  b = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
  });
for (const c of [a, b])
  await c.addInitScript(() =>
    localStorage.setItem("ai-capella-intro-off", "1"),
  );
const p = await a.newPage(),
  q = await b.newPage(),
  errors = [];
for (const page of [p,q]){page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('response',r=>{if(r.status()===404)console.log('404',r.url());});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR',m.text());});}
const suffix = Date.now(),
  emailA = `lead-${suffix}@example.test`,
  emailB = `member-${suffix}@example.test`,
  password = "Browser-fixture-password-42";
const shot = async (page, name) => {
  await page.evaluate(() => document.fonts.ready);
  if (await page.locator('#app.mode-landing #landing').count()) {
    await page.waitForFunction(() => !document.querySelector('.ls-name') || document.querySelector('.ls-name.light-settled'));
    await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
  }
  return page.screenshot({ path: `${evidence}/shots/${name}.png`, fullPage: true });
};
async function mailLink(email, contains = "") {
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await (
      await fetch(
        `${process.env.MAILPIT_URL || "http://127.0.0.1:28025"}/api/v1/messages`,
      )
    ).json();
    for (const mail of list.messages.filter((m) =>
      m.To.some((t) => t.Address === email),
    )) {
      const msg = await (
        await fetch(
          `${process.env.MAILPIT_URL || "http://127.0.0.1:28025"}/api/v1/message/${mail.ID}`,
        )
      ).json();
      const link = msg.Text.match(/https?:\/\/[^\s<>]+/g)?.find((x) =>
        x.includes(contains),
      );
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("No fixture email");
}
async function signup(page, email, name) {
  await page.locator("[name=name]").fill(name);
  await page.locator("[name=email]").fill(email);
  await page.locator("[name=password]").fill(password);
  await page.locator("form button[type=submit]").click();
  await page
    .getByRole("status")
    .filter({ hasText: "Check your email" })
    .waitFor();
  await page.goto(await mailLink(email, "verify-email"));
  await page.locator('[name=password]').fill(password);
  await page.locator('[name=confirm]').fill(password);
  await page.locator('form button[type=submit]').click();
  await page.getByRole('status').filter({hasText:'Email verified'}).waitFor();
}
async function signin(page, email) {
  if (!(await page.locator("[name=email]").count())) await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator("[name=email]").fill(email);
  await page.locator("[name=password]").fill(password);
  await page.locator("form button[type=submit]").click();
}
async function request(page, path, method = "GET", body) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const r = await fetch("/api" + path, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, method, body },
  );
}
try {
  await p.goto(base);
  await p.locator('nav').getByRole('button',{name:'Create account',exact:true}).click();
  await signup(p,emailA,'Offline Singer');await signin(p,emailA);await p.waitForURL('**/app');await p.locator('#landing-empty').waitFor({state:'visible'});
  const created=await request(p,'/ensembles','POST',{name:'Offline Choir'});assert.equal(created.status,201);
  const ensemble=created.body.id;
  await p.evaluate(id=>{sessionStorage.setItem('ai-capella-mode-switch','solo');},ensemble);
  await p.reload();
  if(await p.locator('#mode-solo-btn:visible').count())await p.locator('#mode-solo-btn').click();
  await p.locator('#import-input').setInputFiles('public/evening-rise.musicxml');
  await p.locator('.play-btn').waitFor({state:'visible'});await p.locator('#library-back-btn').click();
  await p.locator('.song-card[data-id] .song-more').first().waitFor();
  await p.evaluate(()=>{window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){if(value?.metadata)throw new DOMException('fixture quota','QuotaExceededError');return window.__originalPut.call(this,value,...args);};});
  await p.locator('.ens-switch').click();await p.getByRole('menuitem',{name:'Make available offline',exact:true}).click();
  await p.getByText('Not enough storage for offline pieces.',{exact:true}).waitFor();await shot(p,'quota-message-en');
  await p.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalPut;});
  await p.locator('.ens-switch').click();await p.getByRole('menuitem',{name:'Make available offline',exact:true}).click();
  await p.locator('.offline-mark').waitFor();
  console.log('SW STATE',await p.evaluate(async()=>({registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,installing:r.installing?.state,waiting:r.waiting?.state,active:r.active?.state})),controller:!!navigator.serviceWorker.controller})));
  await p.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  const userId=await p.evaluate(()=>localStorage.getItem('lightscore-offline-account'));
  const pieceId=await p.locator('.song-card:has(.offline-mark)').getAttribute('data-id');
  const privateNames=await p.evaluate(()=>indexedDB.databases().then(d=>d.map(x=>x.name)));
  assert(privateNames.some(n=>n.startsWith('lightscore-private:'+encodeURIComponent(userId)+':')));
  const cacheUrls=await p.evaluate(async()=>{const urls=[];for(const key of await caches.keys())for(const req of await (await caches.open(key)).keys())urls.push(req.url);return urls;});
  assert(cacheUrls.length>20);assert(cacheUrls.every(u=>!new URL(u).pathname.startsWith('/api')&&!/[?]/.test(u)));assert(cacheUrls.some(u=>u.endsWith('/offline.html')));
  console.log('prepared and public cache verified');
  const cacheContext=await browser.newContext(),cachePage=await cacheContext.newPage(),database=new pg.Client({connectionString:process.env.DATABASE_URL});await database.connect();
  try{const before=(await database.query('select id from session where user_id=$1',[userId])).rows.map(r=>r.id);
  const sign=await cacheContext.request.post(base+'/api/auth/sign-in/email',{headers:{origin:base},data:{email:emailA,password}});assert.equal(sign.status(),200);
  await cachePage.goto(base);const metadata=await request(p,`/ensembles/${ensemble}/pieces/${pieceId}`);const url=`/api/ensembles/${ensemble}/pieces/${pieceId}/versions/${metadata.body.contentHash}`;
  const fetched=await cachePage.evaluate(async url=>{const r=await fetch(url,{cache:'no-store'});return {status:r.status,body:await r.text(),cache:r.headers.get('cache-control')};},url);assert.equal(fetched.status,200);assert.equal(fetched.cache,'private, no-store');
  const sessions=(await database.query('select id from session where user_id=$1',[userId])).rows.filter(r=>!before.includes(r.id));assert.equal(sessions.length,1);await database.query('delete from session where id=$1',[sessions[0].id]);
  const cached=await cachePage.evaluate(async url=>{try{const r=await fetch(url,{cache:'only-if-cached',mode:'same-origin'});return {status:r.status,body:await r.text()};}catch{return {status:0,body:''};}},url);assert.notEqual(cached.body,fetched.body);assert.notEqual(cached.status,200);console.log('PASS server-only expiry has no cached score body');
  }finally{await database.end();await cacheContext.close();}

  await a.setOffline(true);await p.reload();
  await p.locator('.song-card:has(.offline-mark)').waitFor();
  await p.locator('#lib-banner').filter({hasText:'Offline – prepared pieces are available'}).waitFor();
  await shot(p,'offline-banner-en');
  assert.equal(await p.locator('#import-btn').isDisabled(),true);
  await p.locator('.song-card:has(.offline-mark) .song-open').click();
  await p.locator('.play-btn').waitFor();await p.locator('#mode-badge').click();assert.equal(await p.getByRole('menuitem',{name:'Rehearsing together requires a connection',exact:true}).isDisabled(),true);await p.keyboard.press('Escape');assert.equal(await p.locator('.t-save').isVisible(),false);await p.locator('[data-view=staff]').click();await p.locator('#staff').waitFor({state:'visible'});await p.locator('.play-btn').click();
  await p.waitForTimeout(500);await p.locator('.play-btn').click();
  await p.locator('#player-menu-btn').click();await p.getByText('Export as PDF',{exact:true}).click();
  const pdfDownload=p.waitForEvent('download',{timeout:60000});await p.getByRole('button',{name:'Create PDF',exact:true}).click();const pdf=await pdfDownload;await pdf.saveAs(evidence+'/offline-export.pdf');assert(fs.statSync(evidence+'/offline-export.pdf').size>1000);
  // Offline store survives reload; no private URLs entered shared caches.
  assert.equal(await p.locator('.song-card:has(.offline-mark)').count(),1);
  await a.setOffline(false);await p.reload();
  await p.waitForFunction(()=>navigator.onLine);
  await p.locator('.ens-switch').waitFor();
  const old=await request(p,`/ensembles/${ensemble}/pieces/${pieceId}`);
  const xml=fs.readFileSync('public/evening-rise.musicxml','utf8').replace('Evening Rise','Offline new version');
  const updated=await p.evaluate(async({ensemble,pieceId,revision,xml})=>{const r=await fetch(`/api/ensembles/${ensemble}/pieces/${pieceId}/versions`,{method:'POST',headers:{'Content-Type':'text/xml','x-expected-revision':String(revision)},body:xml});return {status:r.status,body:await r.json()};},{ensemble,pieceId,revision:old.body.revision,xml});
  assert.equal(updated.status,200);
  await p.waitForFunction(async({hash})=>{for(const db of await indexedDB.databases()){if(!db.name.startsWith('lightscore-private:'))continue;const values=await new Promise((resolve,reject)=>{const r=indexedDB.open(db.name);r.onsuccess=()=>{const d=r.result,t=d.transaction('data'),q=t.objectStore('data').getAll();t.oncomplete=()=>{d.close();resolve(q.result);};};r.onerror=reject;});if(values.some(v=>v?.metadata?.contentHash===hash))return true;}return false;},{hash:updated.body.contentHash});
  console.log('background prepared version refresh verified');
  // A failed version refresh retains the old offline copy and leaves online controls enabled.
  await p.route('**/versions/*',route=>route.request().method()==='GET'?route.fulfill({status:500,body:'fixture refresh failure'}):route.continue());
  await p.evaluate(()=>{window.__refreshFailed=false;window.addEventListener('offline:refresh-failed',()=>window.__refreshFailed=true,{once:true});});
  const current=await request(p,`/ensembles/${ensemble}/pieces/${pieceId}`);
  const failedRefresh=await p.evaluate(async({ensemble,pieceId,revision,xml})=>{const r=await fetch(`/api/ensembles/${ensemble}/pieces/${pieceId}/versions`,{method:'POST',headers:{'Content-Type':'text/xml','x-expected-revision':String(revision)},body:xml});return r.status;},{ensemble,pieceId,revision:current.body.revision,xml:xml.replace('Evening','Refresh')});
  assert.equal(failedRefresh,200);await p.waitForFunction(()=>window.__refreshFailed);
  assert.equal(await p.locator('.offline-mark').count(),1);
  assert.equal(await p.locator('#mode-ensemble-btn').isDisabled(),false);
  await p.unroute('**/versions/*');
  // Explicit eviction must clear the sibling tab without revoking its membership.
  if(await p.locator('#library-back-btn:visible').count())await p.locator('#library-back-btn').click();
  const evictionTab=await a.newPage();await evictionTab.goto(base+'/app');await evictionTab.locator('.offline-mark').waitFor({state:'attached'});
  await p.locator('.ens-switch').click();await p.getByRole('menuitem',{name:'Remove offline data',exact:true}).click();
  await evictionTab.locator('.offline-mark').waitFor({state:'detached'});await evictionTab.close();
  await p.locator('.ens-switch').click();await p.getByRole('menuitem',{name:'Make available offline',exact:true}).click();await p.locator('.offline-mark').waitFor();
  // A browser that cannot open IndexedDB must still enter the online app.
  const broken=await browser.newContext();await broken.addCookies(await a.cookies());
  await broken.addInitScript(()=>{localStorage.setItem('ai-capella-intro-off','1');indexedDB.open=()=>{throw new DOMException('Unavailable','UnknownError');};});
  const onlineOnly=await broken.newPage();await onlineOnly.goto(base+'/app');await onlineOnly.locator('#app.mode-landing').waitFor();assert.equal(new URL(onlineOnly.url()).pathname,'/app');await broken.close();
  console.log('refresh failure, cross-tab eviction and unavailable IndexedDB verified');

  const originalWorker=fs.readFileSync(`${process.env.LIGHTSCORE_BUILD_ROOT||'dist'}/client/sw.js`,'utf8');
  try {fs.writeFileSync(`${process.env.LIGHTSCORE_BUILD_ROOT||'dist'}/client/sw.js`,originalWorker.replace(/const CACHE = '([^']+)'/,"const CACHE = '$1-browser-update'"));await p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});await p.locator('#offline-update').waitFor();assert.match(await p.locator('#offline-update').innerText(),/New version available/);}finally{fs.writeFileSync(`${process.env.LIGHTSCORE_BUILD_ROOT||'dist'}/client/sw.js`,originalWorker);}
  console.log('waiting worker reload notice verified');
  p.once('dialog',dialog=>dialog.dismiss());
  assert.equal(await p.evaluate(()=>{const event=new Event('vite:preloadError',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),true);

  // A disconnected prepared member loses the ensemble copy as soon as membership is revalidated.
  await q.goto(base);await q.locator('nav').getByRole('button',{name:'Create account',exact:true}).click();await signup(q,emailB,'Second Singer');await signin(q,emailB);await q.waitForURL('**/app');await q.locator('#landing-empty').waitFor({state:'visible'});
  assert.equal((await request(p,`/ensembles/${ensemble}/invitations`,'POST',{email:emailB,idempotencyKey:'offline-invite-'+suffix})).status,201);
  const invitation=new URL(await mailLink(emailB,'/invite/')).pathname.split('/').at(-1);
  assert.equal((await request(q,`/invitations/${invitation}/accept`,'POST',{})).status,200);
  await q.evaluate(()=>sessionStorage.setItem('ai-capella-mode-switch','solo'));await q.reload();await q.locator('.ens-switch').waitFor();
  await q.locator('.ens-switch').click();await q.getByRole('menuitem',{name:'Make available offline',exact:true}).click();await q.locator('.offline-mark').waitFor();await q.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  const sibling=await b.newPage();await sibling.goto(base+'/app');await sibling.locator('.offline-mark').waitFor();
  const memberId=(await request(p,`/ensembles/${ensemble}/members`)).body.find(m=>m.email===emailB).id;
  const memberAccount=await q.evaluate(()=>localStorage.getItem('lightscore-offline-account'));
  const memberStore='lightscore-private:'+encodeURIComponent(memberAccount)+':'+encodeURIComponent(ensemble);
  await b.setOffline(true);await q.reload();await q.locator('.offline-mark').waitFor();
  assert.equal((await request(p,`/ensembles/${ensemble}/members/${memberId}`,'DELETE')).status,200);
  await b.setOffline(false);
  await q.waitForFunction(async name=>!(await indexedDB.databases()).some(d=>d.name===name),memberStore);
  await q.getByText('You are no longer a member of Offline Choir.',{exact:true}).waitFor();
  assert.equal(await q.locator('.offline-mark').count(),0);
  await sibling.locator('.offline-mark').waitFor({state:'detached'});await sibling.close();
  console.log('membership revocation purge verified');
  await q.locator('#landing-samples').click();await q.locator('#lib-menu-btn').waitFor({state:'visible'});await b.setOffline(true);
  await q.locator('#lib-menu-btn').click();await q.getByRole('menuitem',{name:'Account and devices',exact:true}).click();await q.getByRole('button',{name:'Sign out',exact:true}).click();await q.getByText('Please sign in online',{exact:true}).waitFor();
  assert(!(await q.evaluate(()=>indexedDB.databases().then(d=>d.map(x=>x.name)))).some(n=>n.startsWith('lightscore-private:'+encodeURIComponent(memberAccount)+':')));
  console.log('offline logout purge verified');
  await b.setOffline(false);await q.reload();await q.waitForURL('**/?state=signed-out');
  assert.equal(await q.evaluate(()=>localStorage.getItem('lightscore-pending-signout')),null);assert.equal((await request(q,'/me')).status,401);
  console.log('pending signout revoked the server session');
  // Logout through the existing account sheet must delete every account store.
  if(await p.locator('#library-back-btn:visible').count())await p.locator('#library-back-btn').click();
  await p.locator('#lib-menu-btn').click();await p.getByRole('menuitem',{name:'Account and devices',exact:true}).click();
  // Prime a normal HTTP-cache request before logout, independently of the private store.
  assert.equal(await p.evaluate(async url=>{const response=await fetch(url);await response.text();return response.status;},`/api/ensembles/${ensemble}/pieces/${pieceId}/versions/${updated.body.contentHash}`),200);
  const signoutResponse=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/sign-out');
  await p.getByRole('button',{name:'Sign out',exact:true}).click();await p.waitForURL('**/?state=signed-out');
  assert.equal(await (await signoutResponse).headerValue('clear-site-data'),'"cache"');
  assert(!(await p.evaluate(()=>indexedDB.databases().then(d=>d.map(x=>x.name)))).some(n=>n.startsWith('lightscore-private:'+encodeURIComponent(userId)+':')));
  assert.equal(await p.evaluate(async url=>(await fetch(url)).status,`/api/ensembles/${ensemble}/pieces/${pieceId}/versions/${updated.body.contentHash}`),401);
  await signin(p,emailB);await p.waitForURL('**/app');await p.locator('#landing-empty').waitFor({state:'visible'});
  await p.waitForFunction(id=>localStorage.getItem('lightscore-offline-account')===id,memberAccount);
  await a.setOffline(true);await p.reload();await p.locator('#landing-empty').waitFor({state:'visible'});assert.equal(await p.locator('.offline-mark').count(),0);assert.equal(await p.locator(`[data-id="${pieceId}"]`).count(),0);
  await p.evaluate(async()=>{const user=localStorage.getItem('lightscore-offline-account');const r=indexedDB.open('lightscore-private:'+encodeURIComponent(user)+':_identity');await new Promise((resolve,reject)=>{r.onsuccess=()=>{const db=r.result,tx=db.transaction('data','readwrite'),s=tx.objectStore('data'),get=s.get('session');get.onsuccess=()=>s.put({...get.result,verified:Date.now()-15*86400000},'session');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject;};r.onerror=reject;});});
  await p.reload();await p.getByText('Please sign in online',{exact:true}).waitFor();assert.equal(await p.evaluate(()=>localStorage.getItem('lightscore-offline-account')),null);
  assert.deepEqual(errors,[]);
  await a.setOffline(false);await p.goto(base);await signin(p,emailA);await p.waitForURL('**/app');
  await p.waitForFunction(()=>!!localStorage.getItem('lightscore-offline-account'));
  await a.clearCookies();await p.goto(base+'/app');await p.waitForURL('**/?state=expired');
  await p.waitForFunction(async()=>!(await indexedDB.databases()).some(db=>db.name?.startsWith('lightscore-private:')));
  console.log('online cookie-loss app entry purges all private stores');
  console.log('PASS Phase 5a: preparation, offline reload/solo, public cache boundary and logout purge', {ensemble,pieceId});
} catch(e){console.log('FAIL URL',p.url(),await p.locator('body').innerText());console.log('FAIL DATA',await p.evaluate(async()=>{const data=[];for(const {name} of await indexedDB.databases()){if(!name?.endsWith('_identity'))continue;data.push(await new Promise(resolve=>{const r=indexedDB.open(name);r.onsuccess=()=>{const db=r.result;const t=db.transaction('data');const q=t.objectStore('data').get('session');t.oncomplete=()=>{db.close();resolve(q.result);};};}));}return {data,keys:{...localStorage}};}));await p.screenshot({path:evidence+'/offline-failure.png'});throw e;} finally { await browser.close(); }
