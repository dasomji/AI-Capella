import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
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
const c = await browser.newContext({viewport:{width:1440,height:1000}});
const p = await a.newPage(),
  q = await b.newPage(),
  z = await c.newPage(),
  errors = [];
for (const page of [p,q,z]) page.setDefaultTimeout(15000);
for (const page of [p, q, z]) page.on("pageerror", (e) => {errors.push(e.message);console.error('PAGE ERROR',e.message);});
const suffix = Date.now(),
  emailA = `lead-${suffix}@example.test`,
  emailB = `member-${suffix}@example.test`,
  emailC = `third-${suffix}@example.test`,
  password = "Browser-fixture-password-42";
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

  await p.getByRole("button", { name: "Create ensemble", exact: true }).click();
  await p.getByLabel("Name", { exact: true }).fill("Browser Choir");
  await p.locator(".domain-sheet button.primary").click();
  await p.locator(".ens-switch").waitFor();
  const ensembles = (await request(p, "/ensembles")).body,
    e = ensembles[0].id;
  await p.addInitScript(() => localStorage.removeItem("ai-capella-seen"));
  await p.reload();
  await p.locator("#mode-solo-btn").waitFor({ state: "visible" });

  await p.locator("#mode-solo-btn").click();
  await p
    .locator("#import-input")
    .setInputFiles({name:"acceptance.musicxml",mimeType:"application/xml",buffer:Buffer.from(`<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Sync Acceptance</work-title></work><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">${Array.from({length:20},(_,i)=>`<measure number="${i+1}">${i===0?"<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>":""}${i===0||i===4?`<direction><sound tempo="${i===0?240:180}"/></direction>`:""}<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>`).join("")}</part></score-partwise>`)});
  await p.locator(".play-btn").waitFor({ state: "visible" });
  await p.locator("#library-back-btn").click();
  await p.locator(".ens-switch").click();
  await p.getByText("Members & invitations", { exact: true }).click();
  await p.getByLabel("Email", { exact: true }).fill(emailB);
  await p.getByRole("button", { name: "Invite", exact: true }).click();
  await p.getByText(emailB, { exact: true }).waitFor();

  // Full theme matrix reloads with persisted design in captureDesign.
  console.log("invite member");
  const invite = await mailLink(emailB, "/invite/");
  await q.goto(invite);
  await q
    .getByRole("heading", { name: "Invitation to Browser Choir" })
    .waitFor();

  // Invitation theme matrix is captured separately.
  await q.getByRole("button", { name: "Create account", exact: true }).click();
  await signup(q, emailB, "Member Singer");
  await q.getByRole("button", { name: "Sign in", exact: true }).click();
  await signin(q, emailB);
  assert.equal(await q.evaluate(()=>sessionStorage.getItem("lightscore-invite") !== null),true);
  await q.getByRole("button", {name:"Accept invitation", exact:true}).click();
  await q.waitForURL("**/app");


  // Third real member, invited with all capability defaults off.
  const invited=await request(p,`/ensembles/${e}/invitations`,"POST",{email:emailC,idempotencyKey:`third-${suffix}`});
  assert.ok(invited.status<300,JSON.stringify(invited));
  await z.goto(await mailLink(emailC,"/invite/"));
  await z.getByRole("button",{name:"Create account",exact:true}).click();
  await signup(z,emailC,"Third Singer");
  await z.getByRole("button",{name:"Sign in",exact:true}).click();
  await signin(z,emailC);
  await z.getByRole("button",{name:"Accept invitation",exact:true}).click();
  await z.waitForURL("**/app");
  const pages=[p,q,z], results={positionSamples:[]}, runs=[], frames=new Map(pages.map(page=>[page,{commands:0,pings:0,closed:0}]));
  for(const page of pages){
    page.on('websocket',socket=>{socket.on('framesent',frame=>{const f=frames.get(page),s=String(frame.payload);if(s.includes('rehearsal:command'))f.commands++;if(s.includes('clock:ping'))f.pings++;});socket.on('close',()=>frames.get(page).closed++);});
    await page.addInitScript(()=>{
      const Original=window.AudioContext;
      window.AudioContext=new Proxy(Original,{construct(target,args){const ctx=new target(...args);window.fixtureAudio=ctx;window.fixtureClicks=[];window.fixtureNotes=[];
        const create=ctx.createOscillator.bind(ctx);
        ctx.createOscillator=()=>{const osc=create(),set=osc.frequency.setValueAtTime.bind(osc.frequency);
          osc.frequency.setValueAtTime=(value,at)=>{if(osc.type==='square')window.fixtureClicks.push({frequency:value,at});return set(value,at);};const start=osc.start.bind(osc);osc.start=(at=0)=>{if(osc.type!=='square')window.fixtureNotes.push({at});return start(at);};return osc;};
        const buffer=ctx.createBufferSource.bind(ctx);
        ctx.createBufferSource=()=>{const source=buffer(),start=source.start.bind(source);source.start=(at=0,...rest)=>{window.fixtureNotes.push({at});return start(at,...rest);};return source;};
        return ctx;}});
      const dateNow=Date.now.bind(Date),performanceNow=performance.now.bind(performance);window.fixtureJump=0;window.fixturePerformanceJump=0;Date.now=()=>dateNow()+window.fixtureJump;Object.defineProperty(performance,'now',{value:()=>performanceNow()+window.fixturePerformanceJump});
      localStorage.setItem('ai-capella-intro-off','1');
    });
  }
  const hook=page=>page.evaluate(()=>{const {positionAtServerTime,...s}=window.__lightscoreSync;return s;});
  const ready=page=>page.waitForFunction(()=>window.__lightscoreSync?.ready,null,{timeout:20000});
  const together=async page=>{await page.evaluate(()=>{sessionStorage.setItem('ai-capella-mode-switch','ensemble');localStorage.setItem('ai-capella-mode-v2','ensemble');});await page.goto(base+'/app?debug=sync');await ready(page);};
  const setTempo=async bpm=>{
    await action(p,'open-tempo');const input=p.locator('.bpm-input:visible');
    await input.fill(String(bpm));await next(p,()=>input.dispatchEvent('change'));
    await p.keyboard.press('Escape');
  };
  const action=(page,name)=>page.locator(`.transport [data-action="${name}"]:visible`).first().click();
  const converge=async (active=pages)=>{
    const revision=Math.max(...await Promise.all(active.map(async page=>(await hook(page)).revision)));
    await Promise.all(active.map(page=>page.waitForFunction(rev=>window.__lightscoreSync?.ready && window.__lightscoreSync.revision>=rev,revision)));
    const states=await Promise.all(active.map(async page=>(await hook(page)).state));
    states.slice(1).forEach(s=>assert.deepEqual(s,states[0]));return states[0];
  };
  const status=async (value,active=pages)=>{await Promise.all(active.map(page=>page.waitForFunction(v=>window.__lightscoreSync?.status===v,value)));return converge(active);};
  const next=async (page,fn,active=pages)=>{const rev=(await hook(page)).revision;await fn();await page.waitForFunction(r=>window.__lightscoreSync.revision>r,rev);return converge(active);};
  const after=async (page,at)=>page.waitForFunction(at=>window.__lightscoreSync.serverNow>=at,at);
  const aligned=async (active=pages)=>{
    await Promise.all(active.map(page=>page.waitForFunction(()=>window.__lightscoreSync.driftMs!==null && Math.abs(window.__lightscoreSync.driftMs)<=25,null,{timeout:10000})));
    const at=(await hook(active[0])).serverNow+100;
    // Canonical position consistency, independent of the measured audio-clock drift below.
    const beats=await Promise.all(active.map(page=>page.evaluate(at=>window.__lightscoreSync.positionAtServerTime(at),at)));
    assert.ok(Math.max(...beats)-Math.min(...beats)<.05,JSON.stringify(beats));
    const diagnostics=await Promise.all(active.map(hook)),drifts=diagnostics.map(s=>s.driftMs);
    const pairwiseMs=Math.max(...drifts)-Math.min(...drifts);
    assert.ok(pairwiseMs<=50,`Audio position difference ${pairwiseMs}ms`);
    results.positionSamples.push({serverTime:at,pairwiseMs,drifts,uncertainties:diagnostics.map(s=>s.uncertaintyMs)});
    return beats;
  };
  for(const page of pages)await together(page);
  await p.getByText('Sync Acceptance',{exact:true}).first().click();
  for(const page of pages){await page.locator('.play-btn').waitFor({state:'visible'});await page.evaluate(()=>window.fixtureAudio.resume());await ready(page);}
  for(const page of [q,z]){
    const member=(await request(page,'/ensembles')).body.find(x=>x.id===e);
    assert.equal(member.isLead,false);assert.deepEqual(Object.values(member.capabilities),[false,false,false]);
  }
  const piece=(await hook(p)).state.pieceId;
  assert.equal((await hook(p)).timing.measures.length,20);
  assert.ok((await hook(p)).timing.tempos.length>=2);
  console.log('acceptance: calibrated three clients');
  for(let i=0;i<10;i++){
    await next(p,()=>action(p,'stop'));await status('stopped');
    const previous=await Promise.all(pages.map(hook));
    await p.locator('.play-btn').click();const state=await status('playing');
    await Promise.all(pages.map((page,j)=>page.waitForFunction(old=>window.__lightscoreSync.lastScheduledStartServerMs!==old,previous[j].lastScheduledStartServerMs)));
    const sample=await Promise.all(pages.map(hook));
    const starts=await Promise.all(pages.map(page=>page.evaluate(()=>{
      const s=window.__lightscoreSync,ctx=window.fixtureAudio,stamp=ctx.getOutputTimestamp?.(),now=performance.now();
      const valid=ctx.state==='running' && stamp?.performanceTime>0 && Math.abs(stamp.performanceTime-now)<=1000 && Number.isFinite(stamp.contextTime);
      const audio=valid?stamp.contextTime:ctx.currentTime;
      const perf=valid?stamp.performanceTime:now+(ctx.outputLatency||ctx.baseLatency||0)*1000;
      return performance.timeOrigin+perf+(s.lastScheduledStartAudioTime-audio)*1000+s.offsetMs;
    })));
    const differenceMs=Math.max(...starts)-Math.min(...starts);
    assert.ok(differenceMs<=50,`Run ${i}: ${differenceMs}ms`);
    console.log('start run',i,differenceMs);runs.push({differenceMs,starts,uncertainties:sample.map(s=>s.uncertaintyMs)});
    await after(p,state.anchor.serverTime+30);
  }
  results.a={runs,meanMs:runs.reduce((n,r)=>n+r.differenceMs,0)/runs.length,p95Ms:runs.map(r=>r.differenceMs).sort((a,b)=>a-b)[9],maxMs:Math.max(...runs.map(r=>r.differenceMs))};
  await next(q,()=>q.locator('.play-btn').click());await status('paused');
  await next(q,()=>action(q,'bpm-up'));
  await q.locator('[data-action="goto"]').click();
  await q.locator('#goto-input').fill('6');await next(q,()=>q.locator('.goto button[type=submit]').click());
  assert.equal((await hook(p)).state.anchor.beat,20);
  assert.equal((await request(q,`/ensembles/${e}/pieces/${piece}`,'PATCH',{op:'title',value:'Forbidden rename'})).status,403);
  assert.equal((await request(p,`/ensembles/${e}/pieces/${piece}`)).body.title,'Sync Acceptance');
  results.b='passed: pause, seek, tempo; rename 403';
  const concurrentRevision=(await hook(p)).revision,counts=[frames.get(p).commands,frames.get(q).commands];
  const sent=await Promise.all([p.evaluate(()=>{document.querySelector('.transport [data-action="bpm-up"]').click();return performance.timeOrigin+performance.now();}),q.evaluate(()=>{document.querySelector('.transport [data-action="transpose-up"]').click();return performance.timeOrigin+performance.now();})]);
  assert.ok(Math.abs(sent[0]-sent[1])<=20,`Concurrent dispatch exceeded 20 ms: ${sent}`);
  await Promise.all(pages.map(page=>page.waitForFunction(r=>window.__lightscoreSync.revision>r,concurrentRevision)));
  await converge();assert.equal(frames.get(p).commands,counts[0]+1);assert.equal(frames.get(q).commands,counts[1]+1);results.c={passed:true,dispatchSpanMs:Math.abs(sent[0]-sent[1])};
  // Exercise an actually expired count-in/tones window before the late join.
  await p.setViewportSize({width:650,height:1000});await p.locator('[data-action="open-controls"]').click();
  await next(p,()=>p.locator('[data-bind="count-in"]').click());await p.keyboard.press('Escape');await p.setViewportSize({width:1440,height:1000});
  await next(p,()=>action(p,'start-tones'));
  await z.goto(base); // leave room, then join while playing in the tempo-change section
  await next(p,()=>p.locator('.play-btn').click(),[p,q]);const moving=await status('countingIn',[p,q]);
  await after(p,moving.countInUntil+200);
  await together(z);await z.locator('.play-btn').waitFor({state:'visible'});await z.evaluate(()=>window.fixtureAudio.suspend());
  const joinedSuspended=(await hook(p)).serverNow;await after(p,joinedSuspended+5000);await z.locator('body').click({position:{x:2,y:2}});await z.waitForFunction(()=>window.fixtureAudio.state==='running');
  await converge();await aligned();assert.deepEqual((await hook(z)).scheduledClicks,[]);results.d='passed: bar 6 tempo section, expired count-in/tones skipped';
  await p.setViewportSize({width:650,height:1000});await p.locator('[data-action="open-controls"]').click();
  await next(p,()=>p.locator('[data-bind="count-in"]').click());await p.keyboard.press('Escape');await p.setViewportSize({width:1440,height:1000});
  await next(p,()=>action(p,'start-tones'));
  const tempo=await next(q,()=>action(q,'bpm-up'));await after(p,tempo.effectiveAt+1000);await aligned();results.e='passed';
  console.log('acceptance: a-e passed');
  // Offline transport must gate commands and recover an authorized snapshot.
  await b.setOffline(true);await q.waitForFunction(()=>!window.__lightscoreSync.ready);
  assert.equal(await q.locator('.play-btn').isDisabled(),true);
  await q.locator('#mode-badge').filter({hasText:/connecting|verbinde/i}).waitFor();
  const offlineCommands=frames.get(q).commands;
  await q.evaluate(()=>document.querySelector('.play-btn').click());
  await next(p,()=>action(p,'stop'),[p,z]);assert.equal(frames.get(q).commands,offlineCommands);
  await b.setOffline(false);await ready(q);await converge();await aligned();assert.equal(await q.locator('.play-btn').isEnabled(),true);results.h='passed';console.log('acceptance: offline passed');
  await setTempo(90);
  // Count-in grid and tones survive a metronome preference change.
  await p.setViewportSize({width:650,height:1000});await p.locator('[data-action="open-controls"]').click();
  await next(p,()=>p.locator('[data-bind="count-in"]').click());
  await p.keyboard.press('Escape');await p.setViewportSize({width:1440,height:1000});
  await next(p,()=>action(p,'start-tones'));
  await p.locator('.play-btn').click();const counting=await status('countingIn');
  const clicks=await Promise.all(pages.map(async page=>(await hook(page)).scheduledClicks));
  assert.equal(clicks[0].length,4);clicks.slice(1).forEach(x=>assert.deepEqual(x,clicks[0]));
  for(const page of pages)assert.deepEqual(await page.evaluate(()=>window.fixtureClicks.slice(-4).map(c=>c.frequency)),[1500,1000,1000,1000]);
  await next(q,()=>action(q,'metronome'));
  const preserved=await converge();const remainingClicks=await Promise.all(pages.map(async page=>(await hook(page)).scheduledClicks));assert.ok(remainingClicks.every(list=>list.length>0 && list.every(time=>clicks[0].includes(time))));assert.equal(preserved.countInUntil,counting.countInUntil);assert.equal(preserved.startingTonesUntil,counting.startingTonesUntil);
  await after(p,counting.countInUntil+100);await aligned();results.f={passed:true,clicks:clicks[0]};console.log('acceptance: count-in passed');
  // Suspended output, wake event, then wall-clock discontinuity.
  await q.evaluate(()=>window.fixtureAudio.suspend());
  await q.locator('#sound-prompt.show').waitFor();
  const suspendedAt=(await hook(p)).serverNow;await after(p,suspendedAt+5000);
  await q.locator('body').click({position:{x:2,y:2}});await q.waitForFunction(()=>window.fixtureAudio.state==='running');await ready(q);
  const pingsBefore=frames.get(q).pings;
  await q.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));window.fixtureJump=600000;Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  await ready(q);assert.ok(frames.get(q).pings>pingsBefore);await converge();await aligned();
  const beforeSleepCommands=frames.get(q).commands;
  await q.evaluate(()=>{window.fixtureJump+=600000;window.fixturePerformanceJump+=600000;document.querySelector('.transport [data-action="bpm-up"]').click();});
  assert.equal(frames.get(q).commands,beforeSleepCommands,'Sleep must invalidate the clock before sending');await ready(q);await aligned();results.i='passed: suspension banner/tap, visibility, 10-minute wall jump';
  console.log('acceptance: sleep passed');
  // Loop bars 3-4 via the whole-piece strip (80 source quarter beats).
  await next(p,()=>action(p,'stop'));
  await p.setViewportSize({width:650,height:1000});await p.locator('[data-action="open-controls"]').click();await next(p,()=>p.locator('[data-bind="count-in"]').click());await p.keyboard.press('Escape');await p.setViewportSize({width:1440,height:1000});
  await next(p,()=>action(p,'start-tones'));
  const rect=await p.locator('#overview').boundingBox(),x=beat=>rect.x+16+beat/80*(rect.width-32),y=rect.y+rect.height/2;
  await next(p,async()=>{await p.mouse.move(x(8),y);await p.mouse.down();await p.mouse.move(x(16),y,{steps:5});await p.mouse.up();});
  const loop=(await hook(p)).state.loop;assert.ok(Math.abs(loop.startBeat-8)<.1 && Math.abs(loop.endBeat-16)<.1,JSON.stringify(loop));
  await p.locator('.play-btn').click();await status('playing');
  for(const testBpm of [113,77.7]){
  await setTempo(testBpm);const looping=await converge();
  assert.equal(looping.loop.enabled,true);
  const span=(loop.endBeat-loop.startBeat)*60000/looping.bpm;
  const firstWrap=looping.anchor.serverTime+(loop.endBeat-looping.anchor.beat)*60000/looping.bpm;
  for(let wrap=1;wrap<=4;wrap++){await after(p,firstWrap+span*(wrap-1)-300);const high=await Promise.all(pages.map(hook));assert.ok(high.every(s=>s.position>14),JSON.stringify(high.map(s=>s.position)));await after(p,firstWrap+span*(wrap-1)+150);await aligned();const beat=(await p.evaluate(()=>window.__lightscoreSync.positionAtServerTime(window.__lightscoreSync.serverNow)));assert.ok(beat>=loop.startBeat-.02 && beat<loop.endBeat);const low=await Promise.all(pages.map(hook));assert.ok(low.every(s=>s.position<12),JSON.stringify(low.map(s=>s.position)));
    const boundary=firstWrap+span*(wrap-1);
    const counts=await Promise.all(pages.map(page=>page.evaluate(({boundary,span})=>{
      const s=window.__lightscoreSync,ctx=window.fixtureAudio,stamp=ctx.getOutputTimestamp?.(),now=performance.now();
      const valid=stamp?.performanceTime>0 && Math.abs(stamp.performanceTime-now)<=1000;
      const audio=valid?stamp.contextTime:ctx.currentTime,perf=valid?stamp.performanceTime:now+(ctx.outputLatency||ctx.baseLatency||0)*1000;
      return window.fixtureNotes.filter(({at})=>{const server=performance.timeOrigin+perf+(at-audio)*1000+s.offsetMs;return server>=boundary+10 && server<boundary+span-10;}).length;
    },{boundary,span})));
    assert.ok(counts.every(n=>n>0),`Silent loop after wrap ${wrap} at ${testBpm} BPM: ${counts}`);
    (results.loopNoteStarts??=[]).push({bpm:testBpm,wrap,counts});
  }
  }
  results.g={description:'bars 3-4, four wraps each at 113 and 77.7 BPM; non-click source starts after every wrap',wraps:results.loopNoteStarts};
  await q.locator('#player-menu-btn').click();await q.getByText('Settings',{exact:true}).click();
  await q.getByText('Output latency offset',{exact:true}).click();
  const offset=q.getByRole('slider',{name:'Output latency offset'});
  await offset.evaluate(el=>{el.value='80';el.dispatchEvent(new Event('change',{bubbles:true}));});await q.keyboard.press('Escape');
  const calm=await hook(q);await after(p,calm.serverNow+10000);
  const calmEnd=await hook(q);assert.equal(calmEnd.sharedScheduleCount,calm.sharedScheduleCount);assert.ok(Math.abs(calmEnd.schedulingDriftMs)<25);
  results.offset='passed: 80 ms output offset, no reschedule for 10 seconds';
  await q.locator('#player-menu-btn').click();await q.getByText('Settings',{exact:true}).click();await q.getByText('Output latency offset',{exact:true}).click();await q.getByRole('slider',{name:'Output latency offset'}).evaluate(el=>{el.value='0';el.dispatchEvent(new Event('change',{bubbles:true}));});await q.keyboard.press('Escape');
  // The persisted page lifecycle must recreate an authorized session.
  await q.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await ready(q);await converge();await aligned();results.bfcache='passed: disposed session recreated and rejoined';
  // Real process restart, requested over local IPC to the owning harness.
  assert.ok(process.send,'Run through browser-isolated.mjs');
  const restarted=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('restart timeout')),20000);process.once('message',m=>{clearTimeout(timer);m.error?reject(Error(m.error)):resolve();});});
  const beforeRestart=(await hook(p)).state;
  process.send({type:'restart'});
  await Promise.all(pages.map(page=>page.waitForFunction(()=>!window.__lightscoreSync.ready)));
  await restarted;await Promise.all(pages.map(ready));await status('paused');await aligned();const recovered=(await hook(p)).state;const expectedRecovery=await p.evaluate(({at,state})=>window.__lightscoreSync.positionAtServerTime(at,state),{at:recovered.anchor.serverTime,state:beforeRestart});assert.ok(Math.abs(recovered.anchor.beat-expectedRecovery)<.05);await next(p,()=>p.locator('.play-btn').click());await status('playing');results.j='passed';
  // End canonicalization and a fresh late join after the end.
  await next(p,()=>action(p,'loop'));
  await p.locator('[data-action="goto"]').click();await p.locator('#goto-input').fill('20');await next(p,()=>p.locator('.goto button[type=submit]').click());
  await status('stopped');const ended=await converge();assert.equal(ended.anchor.beat,80);await aligned();
  await together(z);await status('stopped');assert.equal((await hook(z)).state.anchor.beat,80);results.n='passed';
  await next(p,()=>p.locator('.play-btn').click());await status('playing');
  // Revocation closes the room and routes the removed member away.
  const memberC=(await request(p,`/ensembles/${e}/members`)).body.find(m=>m.email===emailC);
  assert.ok(memberC);assert.ok((await request(p,`/ensembles/${e}/members/${memberC.id}`,'DELETE')).status<300);
  await z.waitForFunction(()=>!window.__lightscoreSync?.ready);await z.getByText(/no longer a member|entfernt|Mitglied/i).first().waitFor();
  const removedCommands=frames.get(z).commands;await z.evaluate(()=>document.querySelector('.play-btn')?.click());assert.equal(frames.get(z).commands,removedCommands);results.k='passed';
  // Solo never publishes to the ensemble.
  await q.evaluate(()=>{sessionStorage.setItem('ai-capella-mode-switch','solo');localStorage.setItem('ai-capella-mode-v2','solo');});await q.goto(base+'/app?debug=sync');
  await q.getByText('Sync Acceptance',{exact:true}).first().click();const soloCommands=frames.get(q).commands,leadState=(await hook(p)).state;
  await q.locator('.play-btn').click();await q.waitForFunction(()=>window.fixtureAudio.state==='running');
  await q.locator('[data-action="goto"]').click();await q.locator('#goto-input').fill('7');await q.locator('.goto button[type=submit]').click();
  await action(q,'bpm-up');assert.equal(frames.get(q).commands,soloCommands);assert.deepEqual((await hook(p)).state,leadState);results.m='passed';
  // Shared tablet: leave A's room before B signs in, including private keys.
  const accountA=(await request(p,'/me')).body.user.id;
  const privateEnsemble=(await request(p,'/ensembles','POST',{name:'A private ensemble'})).body.id;
  const closedBefore=frames.get(p).closed;
  await p.locator('#player-menu-btn').click();await p.getByText('Account and devices',{exact:true}).click();await p.getByRole('button',{name:'Sign out',exact:true}).click();await p.waitForURL('**/?state=signed-out');
  assert.ok(frames.get(p).closed>closedBefore);
  assert.equal(await p.evaluate(()=>window.__lightscoreSync),undefined);
  const keys=await p.evaluate(()=>Object.keys(localStorage));assert.ok(!keys.some(k=>k.includes(accountA)),JSON.stringify(keys));
  await signin(p,emailB);await p.waitForURL('**/app');
  const bEnsembles=(await request(p,'/ensembles')).body;assert.ok(!bEnsembles.some(x=>x.id===privateEnsemble));assert.equal((await request(p,'/me')).body.user.email,emailB);results.l='passed';
  fs.writeFileSync(evidence+'/sync-acceptance.json' ,JSON.stringify({results,errors},null,2));
  assert.deepEqual(errors,[]);console.log('SYNC ACCEPTANCE',JSON.stringify(results));
 }catch(error){
  const diagnostics=await Promise.all([p,q,z].map(async page=>({url:page.url(),body:await page.locator('body').innerText(),sync:await page.evaluate(()=>{if(!window.__lightscoreSync)return null;const {positionAtServerTime,...s}=window.__lightscoreSync;return s;})})));
  fs.writeFileSync(evidence+'/sync-acceptance-failure.json',JSON.stringify({error:String(error),diagnostics,errors},null,2));
  throw error;
}finally{await browser.close();}

