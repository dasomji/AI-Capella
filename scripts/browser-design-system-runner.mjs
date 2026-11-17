/** Native-browser adapter parity and keyboard checks.
 * Run npm run test:browser:design-system for a disposable repository-relative host.
 * Does not seed, stop the preview, or change product data.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
import {
  verifyDesignSystemPage,
  verifyDesignSystemContexts,
  verifyDesignSystemBehavior,
  verifyP3ReviewFixes,
  verifyP3ReducedMotion,
} from "./browser-design-system.mjs";
const base =
  process.env.BASE_URL ??
  "http://localhost:3000";
const evidence =
  process.env.EVIDENCE_DIR ?? process.env.BROWSER_EVIDENCE ?? ".review-evidence/design-system";
fs.mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const records = [];
try {
  for (const theme of ["papier", "pergament", "samt"])
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        viewport,
        colorScheme: "dark",
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.goto(`${base}/dev/design-system?design=${theme}`);
        await page
          .locator(
            '[data-specimen="table/pagination"] [data-renderer="dom"] div',
          )
          .waitFor();
        const comparison = await page.evaluate(verifyDesignSystemPage),
          contexts = await page.evaluate(verifyDesignSystemContexts);
        assert.deepEqual(comparison.mismatches, []);
        assert.deepEqual(contexts.mismatches, []);
        const behavior = await page.evaluate(verifyDesignSystemBehavior),
          fixes = await page.evaluate(verifyP3ReviewFixes);
        // Actual browser-generated Tab events, in addition to the boundary handler assertions.
        await page.evaluate(async () => {
          window.p3fixture = (
            await import("/src/design-system/browser-fixture.tsx")
          ).mountReactFixture();
        });
        await page.locator("#p3-react-first").waitFor();
        assert.equal(
          await page
            .locator("#p3-react-first")
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await page.keyboard.press("Shift+Tab");
        assert.equal(
          await page
            .locator("#p3-react-last")
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await page.keyboard.press("Tab");
        assert.equal(
          await page
            .locator("#p3-react-first")
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await page.keyboard.press("Tab");
        assert.equal(
          await page
            .locator("#p3-react-last")
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await page.keyboard.press("Escape");
        await page.evaluate(() => window.p3fixture.dispose());
        // Each specimen has its own capture so sheets/drawers cannot overlap or clip siblings.
        for (const variant of [
          "dialog",
          "sheet",
          "drawer",
          "confirm",
          "transcription",
          "admin-confirm",
        ]) {
          const isolation = await page.addStyleTag({
            content: `[data-specimen]:not([data-specimen="dialog/${variant}"]){display:none}`,
          });
          await page
            .locator(`[data-specimen="dialog/${variant}"]`)
            .screenshot({
              path: `${evidence}/showcase-${theme}-${viewport.width}-${variant}.png`,
            });
          await isolation.evaluate((el) => el.remove());
        }
        await page.emulateMedia({ reducedMotion: "reduce" });
        const reduced = await page.evaluate(verifyP3ReducedMotion);
        assert.deepEqual(errors, []);
        const result = {
          theme,
          viewport,
          comparison,
          contexts,
          behavior,
          fixes,
          reduced,
          actualTab: true,
          errors,
        };
        fs.writeFileSync(
          `${evidence}/browser-${theme}-${viewport.width}.json`,
          JSON.stringify(result, null, 2),
        );
        records.push({
          theme,
          viewport,
          properties: comparison.properties + contexts.properties,
          attributes: comparison.attributes,
          regressions: fixes.count,
          actualTab: true,
          reducedMotion: true,
          mismatches: 0,
        });
        console.log(
          theme,
          viewport.width,
          "PASS",
          comparison.specimens,
          "specimens",
          fixes.count,
          "review assertions",
        );
      } catch (error) {
        console.error({errors,body:await page.locator("body").innerText()});
        throw error;
      } finally {
        await context.close();
      }
    }
  fs.writeFileSync(
    `${evidence}/browser-summary.json`,
    JSON.stringify(records, null, 2),
  );
} finally {
  await browser.close();
}
