// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthPage } from '../src/auth-ui';

vi.mock('../src/offline-store', () => ({ purgeLandingIdentity: vi.fn().mockResolvedValue(undefined), storageUnavailable: vi.fn() }));
vi.mock('../src/lightName', () => ({ lightScoreName: () => ({ dispose() {}, push() {}, shown: Promise.resolve() }) }));
vi.mock('../src/artwork', () => ({ animateRibbons: () => () => {} }));

let root: Root | undefined;
let host: HTMLDivElement;
const fetchMock = vi.fn<typeof fetch>();
const input = (name: string) => host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
async function fill(name: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(name), value);
    input(name).dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
async function mount(search = '') {
  history.replaceState(null, '', '/' + search);
  await act(async () => { root = createRoot(host); root.render(<AuthPage />); });
}
async function submit() {
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('ai-capella-lang', 'en');
  host = document.createElement('div'); document.body.append(host);
  fetchMock.mockReset().mockResolvedValue(Response.json({ code: 'INVALID_CREDENTIALS' }, { status: 400 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host.remove(); vi.unstubAllGlobals(); });

describe('account screen contracts', () => {
  it('hydrates native validation and labels, and reveals the same password control', async () => {
    history.replaceState(null, '', '/');
    host.innerHTML = renderToString(<AuthPage />);
    const errors: unknown[] = [];
    await act(async () => { root = hydrateRoot(host, <AuthPage />, { onRecoverableError: error => errors.push(error) }); });
    expect(errors).toEqual([]);
    const email = input('email'), password = input('password');
    expect(email.type).toBe('email'); expect(email.required).toBe(true);
    expect(email.labels?.[0]?.textContent).toBe('Email');
    expect(password.required).toBe(true); expect(password.minLength).toBe(8); expect(password.maxLength).toBe(128);
    email.value = 'invalid'; expect(email.validity.typeMismatch).toBe(true);
    await fill('password', 'password');
    await click([...host.querySelectorAll('button')].find(button => button.textContent === 'show')!);
    expect(input('password')).toBe(password); expect(password.type).toBe('text'); expect(password.value).toBe('password');
    expect(password.labels?.[0]?.textContent).toBe('Password');
  });

  it('announces a confirmation mismatch at the associated field without sending a request', async () => {
    await mount('?verify=fixture');
    await fill('password', 'password'); await fill('confirm', 'different');
    await submit();
    expect(fetchMock).not.toHaveBeenCalled();
    const confirm = input('confirm'), alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Unable to continue');
    expect(confirm.getAttribute('aria-invalid')).toBe('true');
    expect(confirm.getAttribute('aria-describedby')?.split(' ')).toContain(alert?.id);
    await fill('confirm', 'password');
    expect(input('confirm')).toBe(confirm);
    expect(confirm.hasAttribute('aria-invalid')).toBe(false);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps the focused submit command while busy and ignores repeated submission', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise(done => { resolve = done; }));
    await mount(); await fill('email', 'user@test.com'); await fill('password', 'password');
    const button = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.focus(); await submit();
    expect(button.disabled).toBe(false); expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(button);
    await submit(); expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => resolve(Response.json({ code: 'INVALID_CREDENTIALS' }, { status: 400 })));
    expect(button.getAttribute('aria-busy')).toBe('false');
    const status = host.querySelector('[role="status"]')!;
    expect(status.textContent).toContain('Unable to continue');
    expect(input('password').getAttribute('aria-describedby')).toBe(status.id);
  });

  it('keeps the verification resend countdown native-disabled and leaves language choices operable', async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    await mount('?mode=signup'); await fill('name', 'Test Singer'); await fill('email', 'user@test.com'); await fill('password', 'password');
    await submit();
    const resend = [...host.querySelectorAll('button')].find(button => button.textContent?.startsWith('Resend'))!;
    expect(resend.disabled).toBe(true); expect(resend.textContent).toMatch(/Resend \(6[01] s\)/);
    await click(resend); expect(fetchMock).toHaveBeenCalledTimes(1);
    await click([...host.querySelectorAll('button')].find(button => button.textContent === 'DE')!);
    expect(host.querySelector('[role=group][aria-label="Language / Sprache"]')).not.toBeNull();
    expect(document.documentElement.lang).toBe('de');
    expect(localStorage.getItem('ai-capella-lang')).toBe('de');
    expect(host.querySelector('h2')?.textContent).toBe('Prüfe dein Postfach');
  });
});
