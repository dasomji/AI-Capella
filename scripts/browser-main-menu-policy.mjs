import assert from 'node:assert/strict';

/** D48/D24: exercise the shared menu adapter with real viewport, input and native focus. */
export async function verifyMainMenuPolicy(page, viewport) {
  await page.evaluate(async () => {
    const D = await import('/src/design-system/dom/index.ts');
    const button = D.createButton({ text: 'Menu policy opener' });
    button.id = 'menu-policy-opener';
    // Put the anchor at the lower right to require both vertical flip and horizontal clamp.
    Object.assign(button.style, { position: 'fixed', right: '0px', bottom: '0px' });
    document.body.append(button);
    window.preparePolicyMenu = () => {
      button.focus();
      const menu = D.createMenu({ label: 'Policy menu', items: [
        { label: 'Account', onSelect() {} }, { label: 'Settings', onSelect() {} },
      ], onEscape: () => window.policyMenu.requestClose() });
      window.policyMenu = D.createMenuOverlay({ variant: 'library-popover', anchor: button,
        title: 'Main menu', content: menu.element, attrs: { id: "menu-policy-dialog" }, behavior: { onClose: () => menu.dispose() } });
    };
    window.openPolicyMenu = () => {
      window.preparePolicyMenu();
      window.policyMenu.open();
    };
    window.openPolicyMenu();
  });
  const menu = page.locator('#menu-policy-dialog');
  const fine = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
  const expected = fine && viewport.width >= 1200 ? 'anchored' : 'centered';
  assert.equal(await menu.getAttribute('data-dialog-layout'), expected);
  const geometry = async () => menu.evaluate(el => {
    const r = el.getBoundingClientRect(), a = document.querySelector('#menu-policy-opener').getBoundingClientRect();
    return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height,
      anchorTop:a.top, anchorRight:a.right, viewportWidth:innerWidth, viewportHeight:innerHeight };
  });
  const bounds = await geometry();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.right <= viewport.width && bounds.bottom <= viewport.height, JSON.stringify(bounds));
  if (expected === 'anchored') {
    assert.ok(bounds.bottom <= bounds.anchorTop, 'A lower-edge anchor flips above its button');
    assert.ok(bounds.anchorTop - bounds.bottom < 32, 'Popup stays beside its button');
    assert.ok(bounds.anchorRight - bounds.right < 32, 'Popup clamps at the right edge');
  } else {
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2) < 2);
    assert.ok(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2) < 2);
  }
  await page.getByRole('menuitem', { name:'Account', exact:true }).press('ArrowDown');
  assert.equal(await page.getByRole('menuitem', {name:'Settings',exact:true}).evaluate(el=>el===document.activeElement), true);
  await page.evaluate(() => { window.policyIdentity = window.policyMenu.element; });
  const resized = expected === 'anchored' ? {width:768,height:1024} : {width:1440,height:900};
  await page.setViewportSize(resized);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await menu.getAttribute('data-dialog-layout'), expected, 'D24 keeps open presentation');
  assert.equal(await menu.evaluate(el=>el===window.policyIdentity), true, 'D24 keeps DOM identity');
  const rotated = await geometry();
  assert.ok(rotated.x>=0 && rotated.y>=0 && rotated.right<=resized.width && rotated.bottom<=resized.height, JSON.stringify(rotated));
  await page.keyboard.press('Escape');
  await menu.waitFor({state:'detached'});
  assert.equal(await page.locator('#menu-policy-opener').evaluate(el=>el===document.activeElement),true);
  await page.evaluate(() => window.openPolicyMenu());
  const reopened = page.locator('#menu-policy-dialog');
  assert.equal(await reopened.getAttribute('data-dialog-layout'), fine && resized.width >= 1200 ? 'anchored' : 'centered', 'Next open adapts');
  await page.mouse.click(4,4);
  await reopened.waitFor({state:'detached'});
  assert.equal(await page.locator('#menu-policy-opener').evaluate(el=>el===document.activeElement),true,'Outside dismissal restores opener focus');
  // Construct at one width, then open at another: policy is resolved by open(), not construction.
  for (const width of [1199, 1200]) {
    await page.setViewportSize({width:width === 1199 ? 1440 : 768,height:900});
    await page.evaluate(() => window.preparePolicyMenu());
    await page.setViewportSize({width,height:900});
    await page.evaluate(() => window.policyMenu.open());
    assert.equal(await menu.getAttribute('data-dialog-layout'), fine && width >= 1200 ? 'anchored' : 'centered', 'Transport breakpoint and input are read at open time');
    await page.keyboard.press('Escape');
    await menu.waitFor({state:'detached'});
  }
  await page.locator('#menu-policy-opener').evaluate(el=>el.remove());
  await page.setViewportSize(viewport);
}
