import {afterEach, describe, expect, it, vi} from 'vitest';
import {shouldHandlePlayerShortcut} from '../src/player-shortcuts';

const shortcuts = [' ', 'ArrowLeft', 'ArrowRight', 'l', 'L', 'm', 'M', 'f', 'F'];
function accepts(target: Element | Window, key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {key, code:key===' '?'Space':key, bubbles:true, composed:true, cancelable:true, ...options});
  let result = false;
  const listener = (e: KeyboardEvent) => {result = shouldHandlePlayerShortcut(e);};
  window.addEventListener('keydown',listener);
  target.dispatchEvent(event);
  window.removeEventListener('keydown',listener);
  return result;
}
function fixture(html: string) {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}
afterEach(() => {document.body.replaceChildren();vi.restoreAllMocks();});

describe('player shortcut ownership', () => {
  it('handles rehearsal keys on the player background', () => {
    for (const key of shortcuts) expect(accepts(fixture('<div tabindex="0"></div>'),key)).toBe(true);
    for (const key of ['Enter','Escape','Tab','x']) expect(accepts(document.body,key)).toBe(false);
  });
  it.each(['text','email','password','search','number','checkbox','radio','range','button','submit','file','color','date','time','hidden'])('leaves every key with native input type %s', type => {
    const input = fixture(`<input type="${type}">`);
    for (const key of shortcuts) expect(accepts(input,key)).toBe(false);
  });
  it.each(['<audio controls></audio>','<video controls></video>','<textarea></textarea>','<select><option>First</option></select>','<div contenteditable><span>Editable</span></div>','<div contenteditable="plaintext-only"><span>Editable</span></div>'])('leaves editing and selection with %s', html => {
    const root = fixture(html), target = root.querySelector('span') ?? root;
    for (const key of shortcuts) expect(accepts(target,key)).toBe(false);
  });
  it.each(['button','a href="#"','summary','div role="button" tabindex="0"','div role="link" tabindex="0"'])('keeps shortcuts after clicking %s while reserving activation', tag => {
    const control = fixture(`<${tag}><span>Control</span></${tag.split(' ')[0]}>`).firstElementChild!;
    for (const key of shortcuts.filter(key=>key!==' ')) expect(accepts(control,key),key).toBe(true);
    expect(accepts(control,' ')).toBe(false);
    expect(accepts(control,'Enter')).toBe(false);
  });
  it.each(['menuitem','menuitemcheckbox','menuitemradio','switch','checkbox','radio','slider','spinbutton','textbox','searchbox','combobox','listbox','option','treeitem','gridcell','tab','toolbar','radiogroup'])('leaves widget keys and typeahead with ARIA %s', role => {
    const widget = fixture(`<div role="${role}" tabindex="0"><span>Control</span></div>`).firstElementChild!;
    for (const key of shortcuts) expect(accepts(widget,key),key).toBe(false);
  });
  it.each(['<dialog open>','<div role="dialog">','<div role="alertdialog">','<div role="menu">','<div role="menubar">','<div class="overlay">'])('leaves all keys inside %s', layer => {
    fixture(`${layer}<button>Control</button></${layer.split(/[ >]/)[0].slice(1)}>`);
    for (const key of shortcuts) expect(accepts(document.querySelector('button')!,key)).toBe(false);
  });
  it.each(['<dialog open></dialog>','<div role="dialog" aria-modal="true"></div>','<div role="alertdialog" aria-modal="true"></div>'])('blocks background and window shortcuts while modal %s is open', html => {
    fixture(html);
    for (const key of shortcuts) {
      expect(accepts(document.body,key)).toBe(false);
      expect(accepts(window,key)).toBe(false);
    }
  });
  it('ignores closed layers and respects handled, modified and composing events', () => {
    fixture('<dialog></dialog>');
    expect(accepts(document.body,'l')).toBe(true);
    for (const options of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true}]) expect(accepts(document.body,'l',options)).toBe(false);
    document.body.addEventListener('keydown',event=>event.preventDefault(),{once:true});
    expect(accepts(document.body,'l')).toBe(false);
  });
  it('sees native controls through shadow retargeting', () => {
    const host = fixture('<div></div>');
    const shadow = host.attachShadow({mode:'open'});
    shadow.innerHTML='<input type="checkbox">';
    expect(accepts(shadow.querySelector('input')!,' ')).toBe(false);
  });
  it('leaves keys in an open native popover without a role', () => {
    const popover = fixture('<div popover><button>Control</button></div>');
    Object.defineProperty(popover,'showPopover',{value:()=>{}});
    const matches = popover.matches.bind(popover);
    vi.spyOn(popover,'matches').mockImplementation(selector=>selector===':popover-open'||matches(selector));
    for (const key of shortcuts) expect(accepts(popover.firstElementChild!,key)).toBe(false);
  });
});
