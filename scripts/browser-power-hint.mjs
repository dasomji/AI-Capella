import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";
import tailwind from "@tailwindcss/vite";

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
// Raw legacy CSS omits the hint recipe, tokens, native-dialog shell and bundled fonts.
const css = bundles[0].output.find((asset) => asset.type === "asset" && asset.fileName.endsWith(".css")).source;
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
      // Entrances start on the next frame: getAnimations() alone can return an empty list
      // before .open/.show are applied, leaving the sheet translated offscreen in CI.
      await page.waitForFunction(() => document.querySelector(".sheet-root.open") && document.querySelector(".power-hint.show"));
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
        return {
          x, y,
          overlap: rect.left < x && x < rect.right && rect.top < y && y < rect.bottom,
          hintPosition: getComputedStyle(hint).position,
          hintOpacity: getComputedStyle(hint).opacity,
          modal: document.querySelector("dialog").matches(":modal"),
        };
      });
      assert.equal(point.overlap, true, "Fixture must overlap Sign out with the hint");
      assert.equal(point.hintPosition, "fixed", "Fixture must load the hint placement recipe");
      assert.equal(point.hintOpacity, "1", "Fixture must finish the hint entrance");
      assert.equal(point.modal, true, "Fixture must use the native modal lifecycle");
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
}
