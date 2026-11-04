import assert from 'node:assert/strict';

// Exercise auto mode plus persisted overrides (including overrides opposite to the OS).
export const themeCases = [
  { name: 'auto-dark', scheme: 'dark', design: null },
  { name: 'auto-light', scheme: 'light', design: null },
  { name: 'papier', scheme: 'light', design: 'papier' },
  { name: 'pergament', scheme: 'dark', design: 'pergament' },
  { name: 'samt', scheme: 'light', design: 'samt' },
];

export async function assertPlayerContrast(page, selectors = ['#song-title', '.voice-name', '.pos'], requireAll = true) {
  const results = await page.evaluate(({ selectors, requireAll }) => {
    const rgba = value => value.match(/[\d.]+/g).map(Number);
    const over = (front, back) => {
      const a = front[3] ?? 1;
      return front.slice(0, 3).map((v, i) => v * a + back[i] * (1 - a));
    };
    const luminance = rgb => rgb.map(v => {
      v /= 255;
      return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    if (requireAll) for (const selector of selectors) if (!document.querySelector(selector)) throw new Error(`Missing text: ${selector}`);
    return selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)).filter(el => el.getBoundingClientRect().width && el.textContent.trim()).map(el => {

      const ancestors = [];
      for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
      // Composite translucent panels over their ancestor grounds rather than treating
      // transparent as black. Decorative fibre/lighting images do not define the ground.
      const background = ancestors.reduce((bg, node) => over(rgba(getComputedStyle(node).backgroundColor), bg), [255, 255, 255]);
      const foreground = over(rgba(getComputedStyle(el).color), background);
      const a = luminance(foreground), b = luminance(background);
      return { selector, foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    }));
  }, { selectors, requireAll });
  for (const result of results) assert.ok(result.ratio >= 4.5, `${result.selector}: contrast ${result.ratio.toFixed(2)} < 4.5 (${JSON.stringify(result)})`);
  return results;
}

export async function checkPlayerThemes(page, base, screenshot) {
  for (const theme of themeCases) {
    await page.emulateMedia({ colorScheme: theme.scheme });
    await page.evaluate(design => {
      if (design) localStorage.setItem('ai-capella-design', design);
      else localStorage.removeItem('ai-capella-design');
    }, theme.design);
    await page.goto(base + '/app');
    await page.getByText('Evening Rise', { exact: true }).first().click();
    await page.locator('.play-btn').waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    const design = theme.design ?? (theme.scheme === 'light' ? 'pergament' : 'papier');
    assert.deepEqual(await page.evaluate(() => ({
      design: document.documentElement.dataset.design,
      ground: document.documentElement.dataset.ground ?? null,
    })), { design: design === 'pergament' ? 'papier' : design, ground: design === 'pergament' ? 'pergament' : null });
    await assertPlayerContrast(page);
    if (screenshot) await screenshot(`theme-${theme.name}`);
  }
}
