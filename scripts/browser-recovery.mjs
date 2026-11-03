import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.BROWSER_BASE;
const email = `pre-hijack-${Date.now()}@example.test`;
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
const page = await browser.newPage();
async function link(fragment) {
  for(let n=0;n<100;n++) {
    const list=await (await fetch(process.env.MAILPIT_URL+'/api/v1/messages')).json();
    for(const mail of list.messages.filter(m=>m.To.some(t=>t.Address===email))) {
      const msg=await (await fetch(process.env.MAILPIT_URL+'/api/v1/message/'+mail.ID)).json();
      const url=msg.Text.match(/https?:\/\/[^\s<>]+/g)?.find(x=>x.includes(fragment));
      if(url) return url;
    }
    await new Promise(r=>setTimeout(r,100));
  }
  throw Error('Recovery mail missing');
}
try {
  await page.goto(base);
  await page.evaluate(()=>localStorage.setItem('ai-capella-lang','en'));
  await page.reload();
  // Attacker registers the victim's email with a password unknown to the victim.
  assert.equal((await page.request.post(base+'/api/auth/sign-up/email',{headers:{origin:base},data:{email,password:'attacker-password-42',name:'Victim'}})).status(),200);
  console.log('opening mailed link');
  await page.goto(await link('verify-email'));
  await page.locator('[name=confirm]').waitFor({state:'visible'});
  console.log('verification password-proof screen ready');
  await page.getByRole('button',{name:'Forgot password',exact:true}).click();
  assert.equal(await page.locator('[name=confirm]').count(),0);
  await page.locator('[name=email]').fill(email);
  await page.locator('form button[type=submit]').click();
  await page.getByRole('status').filter({hasText:'Check your email'}).waitFor();
  console.log('opening mailed link');
  await page.goto(await link('/reset-password/'));
  await page.locator('[name=password]').fill('victim-recovered-password-43');
  await page.locator('form button[type=submit]').click();
  await page.getByRole('status').filter({hasText:'Password updated'}).waitFor();
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill('victim-recovered-password-43');
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/app');
  assert.equal((await page.request.get(base+'/api/me')).status(),200);
  console.log('Pre-hijack victim recovery: reset verifies email and permits sign-in');
} finally {await browser.close();}
