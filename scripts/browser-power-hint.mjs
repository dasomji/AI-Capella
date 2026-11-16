import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";

// Exercise the real hint and overlay toolkit without relying on a machine running at 30 fps.
const source = (name) => fileURLToPath(new URL(`../src/${name}`, import.meta.url));
const fixtureId = source("__power_hint_fixture__.ts");
const bundles = await build({
  configFile: false,
  logLevel: "silent",
  plugins: [{
    name: "power-hint-fixture",
    resolveId: (id) => id === fixtureId ? id : undefined,
    load: (id) => id === fixtureId
      ? `export { showPowerHint } from ${JSON.stringify(source("powerHint.ts"))};
         export { openSheet, closeOverlay } from ${JSON.stringify(source("ui.ts"))};`
      : undefined,
  }],
  build: {
    write: false,
    minify: false,
    lib: { entry: fixtureId, name: "powerHintFixture", formats: ["iife"] },
  },
});
const code = bundles[0].output.find((asset) => asset.type === "chunk").code;
const css = await readFile(source("style.css"), "utf8");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox"],
});
try {
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
        const { showPowerHint, openSheet } = window.powerHintFixture;
        const content = document.createElement("div");
        content.className = "sheet-body domain-sheet account-sheet";
        content.innerHTML = '<button class="btn primary">Sign out</button><div style="height:180px"></div>';
        content.querySelector("button").onclick = () => content.dataset.clicked = "true";
        if (order === "hint-first") showPowerHint();
        openSheet("Account and devices", content);
        if (order === "sheet-first") showPowerHint();
      }, order);
      // Let both entrance animations finish, then pin the overlap rather than depending on copy height.
      await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
      const point = await page.evaluate(() => {
        const hint = document.querySelector(".power-hint").getBoundingClientRect();
        const sheet = document.querySelector(".sheet");
        const button = sheet.querySelector(".primary").getBoundingClientRect();
        const shift = button.y + button.height / 2 - (hint.y + hint.height / 2);
        sheet.style.bottom = `${parseFloat(getComputedStyle(sheet).bottom) + shift}px`;
        return { x: hint.x + hint.width / 2, y: hint.y + hint.height / 2 };
      });
      const hit = await page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        return { hint: !!target?.closest(".power-hint"), button: target?.closest("button")?.textContent };
      }, point);
      assert.equal(hit.hint, false, `${viewport.width}px ${order}: hint intercepted Sign out`);
      assert.equal(hit.button, "Sign out");
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      assert.equal(await page.locator(".account-sheet").getAttribute("data-clicked"), "true");
      await page.evaluate(() => window.powerHintFixture.closeOverlay());
      await page.locator(".sheet-root").waitFor({ state: "detached" });
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
}
