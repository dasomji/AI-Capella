import { lang } from './i18n';
import { initializeEnsembles } from './ensembles';
document.documentElement.lang=lang;
const choice=localStorage.getItem('ai-capella-design')||'auto';
const design=choice==='auto'?(matchMedia('(prefers-color-scheme: light)').matches?'pergament':'papier'):choice;
document.documentElement.dataset.design=design==='pergament'?'papier':design;
if(design==='pergament')document.documentElement.dataset.ground='pergament';
try {
  await initializeEnsembles();
  await import('./main');
} catch {
  document.querySelector('#app')!.textContent = document.documentElement.lang === 'de' ? 'Bitte online anmelden' : 'Please sign in online';
}
