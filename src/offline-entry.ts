import { initializeTheme } from './design-system/theme';
import { lang } from './i18n';
import { initializeEnsembles } from './ensembles';
document.documentElement.lang=lang;
initializeTheme();
try {
  await initializeEnsembles();
  await import('./main');
} catch {
  document.querySelector('#app')!.textContent = document.documentElement.lang === 'de' ? 'Bitte online anmelden' : 'Please sign in online';
}
