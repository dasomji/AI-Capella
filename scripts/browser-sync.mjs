import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import { captureDesign } from "./browser-design.mjs";
import { assertPlayerContrast } from "./browser-themes.mjs";
const base = process.env.BROWSER_BASE || "http://localhost:3000",
  evidence =
    process.env.BROWSER_EVIDENCE || `${process.cwd()}/.review-evidence/browser`;
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
for (const page of [p, q]) page.on("pageerror", (e) => {errors.push(e.message);console.error('PAGE ERROR',e.message);});
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
  console.log("signup lead");
  await p.goto(base);
  await p
    .locator("nav")
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await signup(p, emailA, "Lead Singer");
  await signin(p, emailA);
  await p.waitForURL("**/app");
  await p.getByText("Not in an ensemble yet", { exact: true }).waitFor();
  await shot(p, "title-empty-dark");
  await p.getByRole("button", { name: "Create ensemble", exact: true }).click();
  await p.getByLabel("Name", { exact: true }).fill("Browser Choir");
  await p.locator(".domain-sheet button.primary").click();
  await p.locator(".ens-switch").waitFor();
  const ensembles = (await request(p, "/ensembles")).body,
    e = ensembles[0].id;
  await p.addInitScript(() => localStorage.removeItem("ai-capella-seen"));
  await p.reload();
  await p.locator("#mode-solo-btn").waitFor({ state: "visible" });
  await shot(p, "title-ensemble-dark");
  await p.locator("#mode-solo-btn").click();
  await p
    .locator("#import-input")
    .setInputFiles("public/evening-rise.musicxml");
  await p.locator(".play-btn").waitFor({ state: "visible" });
  await p.locator("#library-back-btn").click();
  await p.locator(".ens-switch").click();
  await p.getByText("Members & invitations", { exact: true }).click();
  await p.getByLabel("Email", { exact: true }).fill(emailB);
  await p.getByRole("button", { name: "Invite", exact: true }).click();
  await p.getByText(emailB, { exact: true }).waitFor();
  await shot(p, "members-dark");
  // Full theme matrix reloads with persisted design in captureDesign.
  console.log("invite member");
  const invite = await mailLink(emailB, "/invite/");
  await q.goto(invite);
  await q
    .getByRole("heading", { name: "Invitation to Browser Choir" })
    .waitFor();
  await shot(q, "invite-dark");
  // Invitation theme matrix is captured separately.
  await q.getByRole("button", { name: "Create account", exact: true }).click();
  await signup(q, emailB, "Member Singer");
  await q.getByRole("button", { name: "Sign in", exact: true }).click();
  await signin(q, emailB);
  assert.equal(await q.evaluate(()=>sessionStorage.getItem("lightscore-invite") !== null),true);
  await q.getByRole("button", {name:"Accept invitation", exact:true}).click();
  await q.waitForURL("**/app");

  let bCommands=0;
  q.on('websocket',socket=>socket.on('framesent',frame=>{if(String(frame.payload).includes('rehearsal:command'))bCommands++;}));
  for(const page of [p,q]){
    await page.evaluate(()=>{sessionStorage.setItem('ai-capella-mode-switch','ensemble');localStorage.setItem('ai-capella-mode-v2','ensemble');});
    await page.goto(base+'/app?debug=sync');
    try{await page.waitForFunction(()=>window.__lightscoreSync?.ready);}catch(e){console.error('READINESS',await page.evaluate(()=>({hook:window.__lightscoreSync,text:document.body.innerText,mode:localStorage.getItem('ai-capella-mode-v2')})));throw e;}
  }
  await p.getByText('Evening Rise',{exact:true}).first().click();
  for(const page of [p,q])await page.locator('.play-btn').waitFor({state:'visible'});
  for(const page of [p,q]){
    if(await page.evaluate(()=>window.__lightscoreSync.contextState!=='running')) await page.locator('#sound-prompt.show').click();
    await page.waitForFunction(()=>window.__lightscoreSync?.contextState==='running' && window.__lightscoreSync.ready);
  }
  await p.locator('.play-btn').click();
  for(const page of [p,q])await page.waitForFunction(()=>window.__lightscoreSync?.status==='playing');
  const aStart=await p.evaluate(()=>window.__lightscoreSync.lastScheduledStartServerMs);
  const bStart=await q.evaluate(()=>window.__lightscoreSync.lastScheduledStartServerMs);
  const differenceMs=Math.abs(aStart-bStart);
  assert.ok(differenceMs<=100,`scheduled starts differ by ${differenceMs} ms`);
  console.log('Together scheduled start difference (server ms):',differenceMs);
  fs.writeFileSync(evidence+'/sync-starts.json',JSON.stringify({aStart,bStart,differenceMs}));
  await p.locator('.play-btn').click();
  for(const page of [p,q])await page.waitForFunction(()=>window.__lightscoreSync?.status==='paused');
  // The output correction belongs to the device, and survives a page reload.
  await p.locator('#player-menu-btn').click();await p.getByText('Settings',{exact:true}).click();
  await p.getByText('Output latency offset',{exact:true}).click();
  await p.getByRole('slider',{name:'Output latency offset'}).evaluate(el=>{el.value='200';el.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await p.evaluate(()=>localStorage.getItem('ai-capella-output-latency-ms')),'200');
  assert.equal(await q.evaluate(()=>localStorage.getItem('ai-capella-output-latency-ms')),null);
  await p.evaluate(()=>sessionStorage.setItem('ai-capella-mode-switch','ensemble'));
  await p.reload();await p.waitForFunction(()=>window.__lightscoreSync?.ready);
  await p.locator('#player-menu-btn').click();await p.getByText('Settings',{exact:true}).click();
  await p.getByText('Output latency offset',{exact:true}).click();
  assert.equal(await p.getByRole('slider',{name:'Output latency offset'}).inputValue(),'200');
  await q.evaluate(()=>{sessionStorage.setItem('ai-capella-mode-switch','solo');localStorage.setItem('ai-capella-mode-v2','solo');});
  await q.goto(base+'/app?debug=sync');
  await q.getByText('Evening Rise',{exact:true}).first().click();
  const before=bCommands;
  await q.locator('.play-btn').click();
  await q.waitForTimeout(500);
  assert.equal(bCommands,before,'Solo must emit no rehearsal command');
  assert.deepEqual(errors,[]);
  console.log('Phase 3d minimal two-account scenario passed');
}finally{await browser.close();}
