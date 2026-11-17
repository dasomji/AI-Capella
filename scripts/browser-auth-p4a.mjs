/** Evaluate on a mounted sign-in screen in a real browser; never sends a request.
 * Actual Tab/Shift+Tab and modal lifecycle checks use the shared browser's key input.
 */
export async function verifyAuthControls() {
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const email = document.querySelector('input[name=email]');
  const password = document.querySelector('input[name=password]');
  assert(email && password, 'Sign-in controls are mounted');
  assert(email.type === 'email' && email.required, 'Native required/email constraints');
  assert(password.required && password.minLength === 8 && password.maxLength === 128, 'Native password constraints');
  for (const control of [email, password]) {
    assert(control.labels?.length === 1, 'Native label association: ' + control.name);
    assert(getComputedStyle(control).colorScheme === getComputedStyle(document.documentElement).colorScheme, 'Native color-scheme inheritance');
  }
  const reveal = [...document.querySelectorAll('button')].find(button => /^(show|zeigen)$/.test(button.textContent));
  reveal.focus(); reveal.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(document.querySelector('input[name=password]') === password, 'Reveal preserves native control identity');
  assert(password.type === 'text' && reveal.getAttribute('aria-pressed') === 'true', 'Reveal exposes pressed state');
  assert(document.activeElement === reveal, 'Reveal preserves command focus');
  reveal.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(password.type === 'password', 'Hide restores native password type');
  return { colorScheme: getComputedStyle(password).colorScheme, focusable: [...document.querySelectorAll('button,input,a[href]')].filter(element => !element.disabled).map(element => element.name || element.textContent.trim()), overflow: document.documentElement.scrollWidth > innerWidth };
}

/** Evaluate after submitting a mismatched verification confirmation. */
export function verifyAuthErrorAssociation() {
  const confirm = document.querySelector('input[name=confirm]');
  const error = document.querySelector('[role=alert]');
  if (!error?.textContent || confirm?.getAttribute('aria-invalid') !== 'true' || !confirm.getAttribute('aria-describedby')?.split(' ').includes(error.id)) throw Error('Confirmation error must announce and describe its field');
  return { alert: error.textContent, invalid: true, associated: true };
}
