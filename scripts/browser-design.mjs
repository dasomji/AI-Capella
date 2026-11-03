import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertPlayerContrast } from './browser-themes.mjs';

// Visual fixtures only: functional invitation acceptance and authorization are covered
// by browser-phase2b and the real-Postgres integration suite.
export async function captureDesign(browser, lead, member, base, evidence) {
  const root = `${evidence}/shots`;
  const themes = [ ['dark', 'dark', 'auto'], ['light', 'light', 'auto'], ['papier', 'light', 'papier'], ['pergament', 'dark', 'pergament'], ['samt', 'dark', 'samt'] ];
  const backgrounds = {};
  async function settle(page) {
    await page.evaluate(() => document.fonts.ready);
    if (await page.locator('.ls-name').count()) await page.waitForFunction(() => !!document.querySelector('.ls-name.light-settled'));
    await page.evaluate(() => { for (const animation of document.getAnimations()) if (animation.effect?.getComputedTiming().iterations !== Infinity) animation.finish(); });
  }
  async function shot(page, name, selectors = ['.auth-shell h2', '.auth-shell p', '.auth-shell label', '.account-links button', '.language-toggle button']) {
    await settle(page);
    await assertPlayerContrast(page, selectors, false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
    await page.screenshot({path:`${root}/${name}.png`, fullPage:true});
  }
  for (const [theme, scheme, design] of themes) for (const width of [390,1440]) for (const language of ['en','de']) {
    const prefix = `${theme}-${width}-${language}`;
    const context = await browser.newContext({viewport:{width,height:1000}, colorScheme:scheme, reducedMotion:'reduce'});
    await context.addInitScript(({design,language}) => {
      if (design === 'auto') localStorage.removeItem('ai-capella-design'); else localStorage.setItem('ai-capella-design',design);
      localStorage.setItem('ai-capella-lang',language); localStorage.setItem('ai-capella-intro-off','1');
    }, {design,language});
    const page = await context.newPage();
    await page.goto(base);
    await page.locator('input[name=email]').waitFor();
    backgrounds[theme] = await page.locator('.account-stage').evaluate(el => getComputedStyle(el).backgroundColor);
    if (theme === 'light') assert.notEqual(backgrounds.light, backgrounds.dark, 'Theme background must change');
    await shot(page,`${prefix}-signin`);
    await page.getByRole('button',{name:language === 'en' ? 'Create account' : 'Konto erstellen',exact:true}).click();
    await shot(page,`${prefix}-signup`);
    await page.route('**/api/auth/sign-up/email', r => r.fulfill({json:{user:{}}}));
    await page.locator('[name=name]').fill('Singer'); await page.locator('[name=email]').fill('singer@example.test'); await page.locator('[name=password]').fill('visual-fixture-password');
    await page.locator('[type=submit]').click(); await page.getByRole('status').waitFor();
    await shot(page,`${prefix}-check-email`);
    await page.goto(base); await page.getByRole('button',{name:language === 'en' ? 'Forgot password' : 'Passwort vergessen',exact:true}).click();
    await shot(page,`${prefix}-forgot`);
    await page.goto(base+'/?token=visual-fixture'); await page.locator('[name=password]').waitFor(); await shot(page,`${prefix}-reset`);
    for (const state of ['verified','signed-out','expired']) { await page.goto(base+'/?state='+state); await shot(page,`${prefix}-${state}`); }
    await page.goto(base+'/?error=invalid'); await shot(page,`${prefix}-invalid-link`);
    await page.route('**/api/me', r => r.fulfill({status:401,json:{}}));
    let inviteState = 'pending';
    await page.route('**/api/invitations/design-fixture', r => r.fulfill({json:{ensembleName:'Browser Choir',inviter:'Lead Singer',email:'o•••@example.test',state:inviteState}}));
    for (const state of ['pending','expired','revoked','accepted','superseded']) {
      inviteState=state; await page.goto(base+'/invite/design-fixture');
      await page.locator('.auth-shell h2').waitFor(); await shot(page,`${prefix}-invite-${state}`);
    }
    inviteState='pending'; await page.goto(base+'/invite/design-fixture');
    await page.getByRole('button',{name:language === 'en'?'Create account':'Konto erstellen',exact:true}).click(); await page.locator('.account-hint').waitFor(); await shot(page,`${prefix}-invite-signup`);
    await page.route('**/api/me', r => r.fulfill({json:{user:{email:'wrong@example.test'}}}));
    await page.route('**/api/invitations/design-fixture/accept', r => r.fulfill({status:403,json:{code:'wrong_account'}}));
    await page.evaluate(() => sessionStorage.removeItem('lightscore-invite'));
    await page.goto(base+'/invite/design-fixture'); await page.getByRole('button',{name:language==='en'?'Accept invitation':'Einladung annehmen',exact:true}).click(); await shot(page,`${prefix}-invite-wrong-account`);
    await context.close();
  }
  // Copy real authenticated sessions into fresh contexts so stored theme/language
  // cannot leak into another case. Ordinary members have no members endpoint.
  for (const [theme,scheme,design] of themes) for (const width of [390,1440]) for (const language of ['en','de']) for (const [role,source] of [['lead',lead],['manager',member],['ordinary',member]]) {
    const context = await browser.newContext({storageState:await source.context().storageState(), viewport:{width,height:1000}, colorScheme:scheme,reducedMotion:'reduce'});
    await context.addInitScript(language => {
      localStorage.setItem('ai-capella-lang',language); localStorage.removeItem('ai-capella-seen'); localStorage.setItem('ai-capella-intro-off','1');
    },language);
    const page = await context.newPage();
    const prefix = `${theme}-${width}-${language}-${role}`;
    if (role === 'ordinary') await page.route('**/api/ensembles', async route => {
      const response=await route.fetch(); const data=await response.json();
      await route.fulfill({json:data.map(e=>({...e,isLead:false,capabilities:{manageMembers:false,editPieces:false,transcribe:false}}))});
    });
    await page.goto(base+'/app?design='+design); await page.locator('#mode-solo-btn').waitFor(); await settle(page);
    assert.equal(await page.locator('#landing-dedication').isVisible(),true);
    assert.equal(await page.locator('#landing-dedication').evaluate(el=>getComputedStyle(el).opacity),'1');
    assert.equal(await page.locator('#landing-dedication .ded-name').evaluate(el=>getComputedStyle(el).maskImage),'none');
    assert.equal(await page.locator('#mode-solo-btn').isVisible(),true);
    assert.equal(await page.locator('#mode-ensemble-btn').isVisible(),true);
    await shot(page,`${prefix}-title`,['.landing-choice p','.landing-choice button']);
    await page.locator('#mode-solo-btn').click(); await page.locator('.ens-switch').click();
    const item = page.getByText(language==='en'?'Members & invitations':'Mitglieder & Einladungen',{exact:true});
    if (role !== 'ordinary') {
      await item.click(); await page.locator('.domain-heading').first().waitFor();
      if(role === 'lead') {
        const track=page.locator('.capability-switch input').first();
        if(await track.count()) {
          const states=await track.evaluate(async input=>{
            const style=()=>{const background=getComputedStyle(input.nextElementSibling).backgroundColor;const knob=getComputedStyle(input.nextElementSibling,'::after');return {track:background,knob:knob.backgroundColor,transform:knob.transform};};
            const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            const before=input.checked;input.checked=false;await frame();const off=style();input.checked=true;await frame();const on=style();input.checked=before;return {off,on};
          });
          assert.notEqual(states.on.track,states.off.track);
          assert.notEqual(states.on.transform,states.off.transform);
          assert.notEqual(states.on.knob,states.on.track);
        }
      }
      await shot(page,`${prefix}-members`,['.domain-heading','.member-email','.member-identity b','.capability-switch','.ctl-note']);
      const invite = page.getByRole('button',{name:language==='en'?'Invite':'Einladen',exact:true});
      await invite.scrollIntoViewIfNeeded(); await shot(page,`${prefix}-invite-form`,['.domain-heading','.capability-switch']);
    } else {
      assert.equal(await item.count(),0); await page.keyboard.press('Escape');
      await shot(page,`${prefix}-library`,['#lib-title','.ctl-note']);
    }
    await page.keyboard.press('Escape'); await page.locator('#lib-menu-btn').click(); await page.getByText(language==='en'?'Account and devices':'Konto und Geräte',{exact:true}).click(); await page.locator('.account-sheet').waitFor();
    await shot(page,`${prefix}-devices`,['.account-sheet p','.account-sheet button','.domain-heading']);
    if(role==='lead') {
      await page.keyboard.press('Escape');
      await page.route('**/api/ensembles',r=>r.fulfill({json:[]}));
      await page.reload(); await page.locator('#landing-empty:not([hidden])').waitFor();
      await shot(page,`${prefix}-title-empty`,['.landing-empty p','.landing-empty button']);
    }
    await context.close();
  }
  writeDesignIndex(evidence);
}
export function writeDesignIndex(evidence) {
  const root = `${evidence}/shots`;
  const files=fs.readdirSync(root).filter(f=>f.endsWith('.png') && !/^(failure-|player-light|title-empty-light|title-ensemble-light)/.test(f)).sort();
  fs.writeFileSync(`${root}/index.html`, `<!doctype html><meta charset="utf-8"><title>Phase 2 design pass</title><style>body{font:14px system-ui;background:#292630;color:#eee}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}img{width:100%;height:300px;object-fit:contain;background:#18151e}figure{margin:0}a{color:inherit}</style><h1>Phase 2 design pass</h1><p>Auth and invitation edge states, empty-ensemble responses and ordinary-member capability restrictions use explicit browser visual fixtures. Lead/manager sheets and device lists use real isolated accounts. Integration scenarios test server authorization. Ordinary members have no member-list permission and no members sheet.</p><main>${files.map(f=>`<figure><a href="${f}"><img loading="lazy" src="${f}">${f}</a></figure>`).join('')}</main>`);
}
