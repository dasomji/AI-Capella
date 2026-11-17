/** Runs against the read-only browser-p4c-parity fixtures, with actual browser key events. */
import assert from 'node:assert/strict';
export async function verifyP4cKeyboard(page, theme) {
  const active = locator => locator.evaluate(node => node === document.activeElement);
  const wrap = async dialog => {
    await dialog.waitFor({state:"visible"});
    const focusable = dialog.locator('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary');
    const visible=[];for(const node of await focusable.all())if(await node.isVisible()&&await node.evaluate(e=>e.tabIndex>=0))visible.push(node);
    const first=visible[0],last=visible.at(-1);assert.ok(first&&last);
    await last.focus();await page.keyboard.press('Tab');assert.ok(await active(first),'forward modal Tab wrap');
    await first.focus();await page.keyboard.press('Shift+Tab');assert.ok(await active(last),'reverse modal Tab wrap');
  };
  await page.evaluate(()=>{document.body.replaceChildren();const b=document.createElement('button');b.id='fixture-opener';b.textContent='Open fixture';document.body.append(b);b.focus();window.ui.createEnsembleSheet(()=>{});});
  await wrap(page.getByRole('dialog'));
  const input=page.getByRole('textbox');await input.focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SELECT');
  assert.equal(await input.evaluate(e=>getComputedStyle(e).colorScheme),theme==='night-paper'?'dark':'light');
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert.ok(await active(page.locator('#fixture-opener')));
  await page.evaluate(()=>window.ui.membersSheet('fixture',document.querySelector('#fixture-opener')));
  await page.locator('.row-menu summary').first().waitFor();await wrap(page.getByRole('dialog'));
  const summary=page.locator('.row-menu summary').first();await summary.focus();await page.keyboard.press('ArrowDown');
  const menu=page.getByRole('menu').first(),items=menu.getByRole('menuitem');assert.ok(await active(items.first()));
  await page.keyboard.press('End');assert.ok(await active(items.last()));await page.keyboard.press('Home');assert.ok(await active(items.first()));
  await page.keyboard.press('r');assert.ok(await active(items.last()),'menu typeahead');
  await page.keyboard.press('Escape');assert.ok(await active(summary));assert.equal(await summary.evaluate(e=>e.parentElement.open),false);
  await page.keyboard.press('ArrowDown');await page.keyboard.press('End');await page.keyboard.press('Enter');
  await page.getByRole('alertdialog').waitFor();assert.equal(await page.locator('dialog:modal').count(),2);await wrap(page.getByRole('alertdialog'));
  await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor({state:'detached'});assert.equal(await page.locator('dialog:modal').count(),1);assert.ok(await active(summary),'nested confirmation returns to menu trigger');
  const capability=page.getByRole('switch').first();await capability.focus();await page.keyboard.press('Space');await page.waitForTimeout(100);assert.ok(await active(capability),'permission update retains focused native input');
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert.ok(await active(page.locator('#fixture-opener')));
  await page.evaluate(async()=>{const entry=document.createElement('button');entry.id='transcription-entry';entry.textContent='Read a score';const jobs=document.createElement('div');document.body.append(entry,jobs);window.tx=(await import('/src/transcription.ts')).installTranscription({beforeListen:()=>true,reviewCleanup:()=>()=>{},socket:{on(){},off(){},emit(){}},ensemble:()=> 'fixture',entry,jobs,open:async()=>{}});});
  await page.locator('.tx-job').waitFor();const jobSummary=page.locator('.tx-job summary');await jobSummary.focus();await page.keyboard.press('ArrowDown');assert.ok(await active(page.getByRole('menuitem').last()));await page.keyboard.press('Escape');assert.ok(await active(jobSummary));
  await page.locator('#transcription-entry').click();await wrap(page.getByRole('dialog'));
  assert.equal(await page.locator('#tx-language').getAttribute('aria-labelledby'),'tx-language-label');
  const choose=page.getByRole('button',{name:/Choose PDF/});await choose.scrollIntoViewIfNeeded();await choose.focus();const chooser=page.waitForEvent('filechooser');await choose.press('Space');await (await chooser).setFiles([]);
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert.ok(await active(page.locator('#transcription-entry')));
  const review=page.getByRole('button',{name:'Review',exact:true});await review.click();await page.locator('.tx-score svg').first().waitFor();await wrap(page.getByRole('dialog'));
  const narrow=page.viewportSize().width<900;const comparison=narrow?page.getByRole('button',{name:'Show original',exact:true}):page.getByRole('switch');await comparison.focus();await page.keyboard.press('Space');await page.locator('.tx-original img').waitFor();assert.equal(await comparison.getAttribute(narrow?'aria-pressed':'aria-checked'),'true');assert.ok(await active(comparison));if(narrow){assert.ok(await page.locator('.tx-score').isHidden());await page.keyboard.press('Space');assert.ok(await page.locator('.tx-score').isVisible());assert.ok(await page.locator('.tx-original').isHidden());assert.ok(await active(comparison));}
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert.ok(await active(review));
  await page.evaluate(async()=>{window.tx.dispose();document.body.replaceChildren();const opener=document.createElement('button');opener.id='fixture-opener';opener.className='ens-switch';opener.textContent='Testchor';document.body.append(opener);opener.focus();window.intro.startIntro('library');});
  await page.locator('.intro-card.shown').waitFor();const next=page.locator('.intro-moves button').last(),skip=page.locator('.intro-asides button').first();assert.ok(await active(next));await page.keyboard.press('Tab');assert.ok(await active(skip));await page.keyboard.press('Shift+Tab');assert.ok(await active(next));await page.keyboard.press('Escape');assert.ok(await active(page.locator('#fixture-opener')));
  await page.waitForTimeout(400);await page.evaluate(()=>window.power.showPowerHint());await page.locator('.power-hint.show').waitFor();const never=page.locator('.power-hint button').first(),ok=page.locator('.power-hint button').last();await never.focus();await page.keyboard.press('Tab');assert.ok(await active(ok));await page.keyboard.press('Enter');await page.locator('.power-hint').waitFor({state:'detached'});
  return {theme,checks:['native theme','sheet/dialog Tab wrap','focus return','Escape','stacked confirm','menu arrows/home/end/typeahead','switch focus identity','file chooser','review comparison','tour focus order','power hint keyboard']};
}
