import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { build } from "vite";
import tailwind from "@tailwindcss/vite";
import { ownerFixture } from "./owner-decisions-fixture.mjs";

// Exercise the real hint and overlay toolkit without relying on a machine running at 30 fps.
const source = (name) => fileURLToPath(new URL(`../src/${name}`, import.meta.url));
const fixtureId = source("__power_hint_fixture__.ts");
const bundles = await build({
  configFile: false,
  logLevel: "silent",
  plugins: [tailwind(), {
    name: "power-hint-fixture",
    resolveId: (id) => id === fixtureId ? id : undefined,
    load: (id) => id === fixtureId
      ? `import ${JSON.stringify(source("design-system/app.css"))};
         export { showPowerHint } from ${JSON.stringify(source("powerHint.ts"))};
         export { createSheet, createButton, closeOverlay } from ${JSON.stringify(source("design-system/dom/index.ts"))};`
      : undefined,
  }],
  build: {
    write: false,
    minify: false,
    lib: { entry: fixtureId, name: "powerHintFixture", formats: ["iife"] },
  },
});
const code = bundles[0].output.find((asset) => asset.type === "chunk").code;
// Raw legacy CSS omits the hint recipe, tokens, native-dialog shell and bundled fonts.
const css = bundles[0].output.find((asset) => asset.type === "asset" && asset.fileName.endsWith(".css")).source;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox"],
});
const evidence = path.resolve(process.env.BROWSER_EVIDENCE ?? '.review-evidence/power-hint');
await fs.mkdir(evidence, { recursive: true });
const measurements = [];
const { server, base } = await ownerFixture(evidence);
try {
  // Use the populated player and hint, with a deterministic trigger independent of
  // device frame cadence. Include both acceptance-suite sizes and portrait/landscape.
  for (const theme of ['night-paper', 'parchment']) for (const language of ['en', 'de']) {
    const page = await browser.newPage();
    await page.addInitScript(language => localStorage.setItem('ai-capella-lang',language),language);
    await page.routeWebSocket('**', ws => ws.close());
    await page.goto(base + 'owner.html');
    await page.waitForFunction(() => window.ownerReady);
    await page.evaluate(async theme => {
      const { setThemePreference } = await import('/src/design-system/theme/index.ts');
      setThemePreference(theme);
      await owner.player(16);
      const { createPowerHint } = await import('/src/powerHint.ts');
      const frame = createPowerHint();
      for (let stamp = 0; stamp <= 6000; stamp += 1000/30) frame(stamp, 2);
      if (sessionStorage.getItem('ai-capella-power-hint-shown') !== '1') throw Error('Capped frames must show the hint');
    }, theme);
    for (const [width,height] of [[1440,1000],[650,1000],[1440,900],[768,1024],[390,844],[844,390]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => document.querySelector('.power-hint.show'));
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished));
      });
      // ResizeObserver schedules placement for the next rendering frame.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await page.evaluate(() => {
        const rect = el => el.getBoundingClientRect().toJSON();
        const hint = document.querySelector('.power-hint');
        const controls = [...document.querySelectorAll('#player button,#player input')]
          .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
          .map(el => ({ action: el.dataset.action ?? el.id, ...rect(el) }));
        return { hint: rect(hint), controls };
      });
      const overlaps = geometry.controls.filter(r => geometry.hint.left < r.right && geometry.hint.right > r.left && geometry.hint.top < r.bottom && geometry.hint.bottom > r.top);
      assert.ok(geometry.controls.length > 10, 'Use a populated player, including the numbered voice key');
      measurements.push({ theme, language, width, height, ...geometry, overlaps });
      if (!overlaps.length) {
        assert.ok(geometry.hint.top >= 0 && geometry.hint.bottom <= height, 'Hint remains within the viewport');
        const opener = page.locator('[data-action="open-controls"]');
        if (await opener.isVisible()) {
          await opener.click();
          await page.locator('dialog[open]').waitFor();
          await page.keyboard.press('Escape');
          await page.locator('dialog[open]').waitFor({state:'detached'});
        }
      }
      await page.screenshot({path:path.join(evidence,`${theme}-${language}-${width}x${height}.png`)});
    }
    // Persistent, but both dismissal choices remain reachable even in short landscape.
    await page.getByRole('button', {name: language === 'en' ? 'Got it' : 'Verstanden', exact:true}).click();
    await page.locator('.power-hint').waitFor({state:'detached'});
    await page.evaluate(async () => {
      const {createPowerHint} = await import('/src/powerHint.ts');
      const frame = createPowerHint();
      for (let stamp=0;stamp<=6000;stamp+=1000/30) frame(stamp,2);
    });
    assert.equal(await page.locator('.power-hint').count(),0,'Automatic hint is once per visit');
    await page.close();
  }
  await fs.writeFile(path.join(evidence,'player-geometry.json'), JSON.stringify(measurements,null,2));
  assert.equal(measurements.filter(m=>m.overlaps.length).length, 0,
    `Power hint covers player controls: ${JSON.stringify(measurements.filter(m=>m.overlaps.length).map(({theme,language,width,height,hint,overlaps})=>({theme,language,width,height,hint,overlaps})))}`);
  console.log('POWER HINT: player controls never overlap at all six viewports, EN/DE and both supported themes');
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(2000);
    await page.route("**/*", (route) => route.request().resourceType() === "document"
      ? route.fulfill({ contentType: "text/html", body: "<!doctype html><html lang='en'><body></body></html>" })
      : route.abort());
    await page.goto("http://power-hint.test/");
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: code });
    for (const order of ["hint-first", "sheet-first"]) {
      await page.evaluate((order) => {
        const { showPowerHint, createSheet, createButton } = window.powerHintFixture;
        const content = document.createElement("div");
        content.className = "account-sheet";
        content.append(createButton({ text: "Sign out", intent: "primary" }));
        const spacer = document.createElement("div");
        spacer.style.height = "180px";
        content.append(spacer);
        content.querySelector("button").onclick = () => content.dataset.clicked = "true";
        if (order === "hint-first") showPowerHint();
        createSheet({ variant: "domain-sheet", title: "Account and devices", content }).open();
        if (order === "sheet-first") showPowerHint();
      }, order);
      // Entrances start on the next frame: getAnimations() alone can return an empty list
      // before .open/.show are applied, leaving the sheet translated offscreen in CI.
      await page.waitForFunction(() => document.querySelector('dialog[open][data-panel-state="open"]') && document.querySelector(".power-hint.show"));
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().map((animation) => animation.finished));
      });
      const point = await page.evaluate(() => {
        const hint = document.querySelector(".power-hint");
        const button = document.querySelector(".account-sheet button").getBoundingClientRect();
        const x = button.x + button.width / 2, y = button.y + button.height / 2;
        // Pin only hint geometry; preserve the real sheet position, native top layer and
        // both elements' stacking/input policies. Font or copy height cannot move this point.
        hint.style.transition = "none";
        hint.style.left = `${x}px`;
        hint.style.top = `${y}px`;
        hint.style.bottom = "auto";
        hint.style.transform = "translate(-50%, -50%)";
        const rect = hint.getBoundingClientRect();
        const panel = document.querySelector("dialog").getBoundingClientRect();
        return {
          x, y,
          buttonInsidePanel: button.left >= panel.left && button.right <= panel.right && button.top >= panel.top && button.bottom <= panel.bottom,
          overlap: rect.left < x && x < rect.right && rect.top < y && y < rect.bottom,
          hintPosition: getComputedStyle(hint).position,
          hintOpacity: getComputedStyle(hint).opacity,
          modal: document.querySelector("dialog").matches(":modal"),
        };
      });
      assert.equal(point.buttonInsidePanel, true, "Sheet must contain its button; native max-size utilities must remain unbounded");
      assert.equal(point.overlap, true, "Fixture must overlap Sign out with the hint");
      assert.equal(point.hintPosition, "fixed", "Fixture must load the hint placement recipe");
      assert.equal(point.hintOpacity, "1", "Fixture must finish the hint entrance");
      assert.equal(point.modal, true, "Fixture must use the native modal lifecycle");
      const hit = await page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        return { hint: !!target?.closest(".power-hint"), button: target?.closest("button")?.textContent };
      }, point);
      assert.equal(hit.hint, false, `${viewport.width}px ${order}: hint intercepted Sign out`);
      if(hit.button !== "Sign out") console.error('POWER_HINT_HIT_DIAGNOSTIC', JSON.stringify({viewport,order,point,hit,layout:await page.evaluate(()=>[...document.querySelectorAll('dialog,.account-sheet,.account-sheet button')].map(el=>({tag:el.tagName,classes:el.className,rect:el.getBoundingClientRect().toJSON(),pointerEvents:getComputedStyle(el).pointerEvents,transform:getComputedStyle(el).transform,display:getComputedStyle(el).display})))},null,2));
      assert.equal(hit.button, "Sign out");
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      assert.equal(await page.locator(".account-sheet").getAttribute("data-clicked"), "true");
      await page.evaluate(() => window.powerHintFixture.closeOverlay());
      await page.locator("dialog[open]").waitFor({ state: "detached" });
      assert.equal(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".power-hint"), point), true,
        "The same point must reach the hint after closing the sheet");
      await page.getByRole("button", { name: "Got it", exact: true }).click();
      await page.locator(".power-hint").waitFor({ state: "detached" });
    }
    // The permanent dismissal must still work when no overlay is open.
    await page.evaluate(() => window.powerHintFixture.showPowerHint());
    await page.getByRole("button", { name: "Don't show again", exact: true }).click();
    await page.locator(".power-hint").waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => localStorage.getItem("ai-capella-power-hint-off")), "1");
    await page.close();
  }
  console.log("POWER HINT: desktop/mobile, both overlay orders, sign-out clicks and dismissals passed");
} finally {
  await browser.close();
  await server.close();
}
