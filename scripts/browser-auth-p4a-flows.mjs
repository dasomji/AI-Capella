// Real auth/DB and captured mail; run through browser-isolated.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { verifyAuthControls, verifyAuthErrorAssociation } from './browser-auth-p4a.mjs';

const base = process.env.BROWSER_BASE || 'http://localhost:3000';
const evidence = process.env.BROWSER_EVIDENCE || '.review-evidence/auth-p4a';
fs.mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const errors = [];
const baseline = process.env.P4A_BASELINE === '1';
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', ...(baseline ? { reducedMotion: 'reduce' } : {}) });
await context.addInitScript(() => {
  localStorage.setItem('ai-capella-intro-off', '1');
  localStorage.setItem('ai-capella-lang', 'en');
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const submit = () => page.locator('form button[type=submit]').click();
const status = text => page.getByRole('status').filter({ hasText: text }).waitFor();
async function mailLink(email, contains) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const list = await (await fetch(`${process.env.MAILPIT_URL}/api/v1/messages`)).json();
    for (const mail of list.messages.filter(mail => mail.To.some(to => to.Address === email))) {
      const message = await (await fetch(`${process.env.MAILPIT_URL}/api/v1/message/${mail.ID}`)).json();
      const link = message.Text.match(/https?:\/\/[^\s<>]+/g)?.find(link => link.includes(contains));
      if (link) return link;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(`Captured mail missing: ${contains}`);
}
async function signin(email) {
  await page.goto(base);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('password');
  await submit();
}
async function signup(email) {
  await page.goto(base + '/?mode=signup');
  await page.getByLabel('Name', { exact: true }).fill('Test Singer');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('password');
  await submit();
  await status('Check your email');
  assert.equal(await page.getByRole('button', { name: /^Resend/ }).isDisabled(), true);
  await page.goto(await mailLink(email, 'verify-email'));
  await page.getByLabel('Password', { exact: true }).fill('password');
  await page.locator('[name=confirm]').fill('different');
  await submit();
  if (!baseline) assert.equal((await page.evaluate(verifyAuthErrorAssociation)).associated, true);
  await page.locator('[name=confirm]').fill('password');
  await submit();
  await status('Email verified');
}
async function api(path, method = 'GET', data) {
  const response = await page.request.fetch(base + '/api' + path, { method, data, headers: { Origin: base } });
  assert.ok(response.ok(), `${method} ${path}: ${response.status()}`);
  return response.json();
}
try {
  await page.goto(base);
  await page.waitForFunction(() => Object.keys(document.querySelector('[name=email]') || {}).some(key => key.startsWith('__reactProps$')));
  if (!baseline) {
    console.log('Native controls', await page.evaluate(verifyAuthControls));
    await page.getByLabel('Email', { exact: true }).focus();
    for (const selector of ['[name=password]', 'button[aria-pressed]', '[type=submit]']) {
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(selector).filter({ visible: true }).last().evaluate(el => el === document.activeElement), true);
    }
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.getByRole('button', { name: 'show', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByLabel('Email', { exact: true }).fill('invalid');
    await submit();
    assert.equal(await page.locator('[name=email]').evaluate(el => el.validity.typeMismatch), true);
    await page.getByLabel('Email', { exact: true }).fill('user@test.com');
    await page.getByLabel('Password', { exact: true }).fill('password');
    await submit();
    await status('Unable to continue');
    assert.equal(await page.locator('[name=password]').evaluate(el => el.getAttribute('aria-describedby') === document.querySelector('[role=status]').id), true);
  }
  await signup('user@test.com');
  await page.goto(base);
  await page.getByRole('button', { name: 'Forgot password', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('user@test.com');
  await submit();
  await status('Check your email');
  await page.goto(await mailLink('user@test.com', 'reset-password'));
  await page.getByLabel('Password', { exact: true }).fill('password');
  await submit();
  await status('Password updated');
  console.log('Signup, field announcement, native validation and password reset passed');
  await signup('admin@test.com');
  await signin('admin@test.com');
  await page.waitForURL('**/app');
  const ensemble = await api('/ensembles', 'POST', { name: 'Browser Choir' });
  await api(`/ensembles/${ensemble.id}/invitations`, 'POST', { email: 'user@test.com', language: 'en', idempotencyKey: crypto.randomUUID() });
  const inviteLink = await mailLink('user@test.com', '/invite/');
  await page.goto(inviteLink);
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await status('You are signed in as');
  await page.getByRole('button', { name: 'Sign out and switch account', exact: true }).click();
  await page.waitForURL('**/?invite=**');
  await signin('user@test.com');
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await page.waitForURL('**/app');
  assert.equal((await api('/ensembles'))[0].name, 'Browser Choir');
  if (await page.locator('#mode-solo-btn').isVisible()) await page.locator('#mode-solo-btn').click();
  await page.locator('#lib-menu-btn').click();
  await page.getByText('Account and devices', { exact: true }).click();
  const shared = page.getByLabel('This device is shared (24 h offline)', { exact: true });
  await shared.check();
  assert.equal(await page.evaluate(() => localStorage.getItem('lightscore-shared-device')), '1');
  await shared.uncheck();
  const dialog = page.locator('dialog[open]');
  const focusable = dialog.locator('button:not([disabled]), input:not([disabled]), a[href]');
  await focusable.last().focus();
  await page.keyboard.press('Tab');
  assert.equal(await focusable.first().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await focusable.last().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.locator('#lib-menu-btn').evaluate(el => el === document.activeElement), true);
  if (process.env.P4A_CAPTURE_ACCOUNT === '1') {
    for (const [theme, design] of [['night-paper', 'papier'], ['parchment', 'pergament']]) {
      for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.goto(base + '/app?design=' + design);
        if (await page.locator('#mode-solo-btn').isVisible()) await page.locator('#mode-solo-btn').click();
        await page.locator('#lib-menu-btn').click();
        await page.getByText('Account and devices', { exact: true }).click();
        await page.getByText(/· This device$/).waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `${evidence}/${theme}-${width}-account-sheet.png` });
        await page.keyboard.press('Escape');
        await page.locator('.account-sheet').waitFor({ state: 'detached' });
      }
    }
  }
  await page.goto(inviteLink);
  await status('already');
  await signin('admin@test.com');
  await page.waitForURL('**/app');
  const revoked = await api(`/ensembles/${ensemble.id}/invitations`, 'POST', { email: 'member@test.com', language: 'en', idempotencyKey: crypto.randomUUID() });
  await api(`/ensembles/${ensemble.id}/invitations/${revoked.id}`, 'DELETE');
  await page.goto(await mailLink('member@test.com', '/invite/'));
  await status('revoked');
  assert.deepEqual(errors, []);
  console.log('P4a real auth, reset, invitation and account keyboard journeys passed');
} catch (error) {
  await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true });
  console.error('Screen at failure:', await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
}
