// Optional CI preload; inherited by browser harness child processes via NODE_OPTIONS.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve('.review-evidence/playwright');
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const tracked = new WeakSet();
  async function track(context) {
    if (tracked.has(context)) return;
    tracked.add(context);
    await mkdir(root, { recursive: true });
    const id = `${process.pid}-${randomUUID()}`;
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const close = context.close.bind(context);
    context.close = async (...options) => {
      await context.tracing.stop({ path: `${root}/${id}.zip` });
      return close(...options);
    };
  }
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...options) => { const context = await newContext(...options); await track(context); return context; };
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...options) => { const page = await newPage(...options); await track(page.context()); return page; };
  const close = browser.close.bind(browser);
  browser.close = async (...options) => {
    for (const context of browser.contexts()) {
      for (const [i, page] of context.pages().entries()) {
        if (!page.isClosed()) await page.screenshot({ path: `${root}/${process.pid}-${randomUUID()}-${i}.png` });
      }
      await context.close();
    }
    return close(...options);
  };
  return browser;
};
