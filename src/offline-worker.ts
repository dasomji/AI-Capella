import { createButton } from './design-system/dom';
import { off } from './offline-text';
export async function registerOfflineWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.MODE === 'development') return;
  const registration = await navigator.serviceWorker.register('/sw.js');
  const show = () => {
    if (!registration.waiting) {document.querySelector('#offline-update')?.remove();return;}
    if (!registration.active || document.querySelector('#offline-update')) return;
    const notice = createButton({text:off('update'),attrs:{id:'offline-update'},layout:['tw:fixed','tw:bottom-18','tw:right-18','tw:z-menu']});
    notice.onclick = () => { navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {once:true}); registration.waiting?.postMessage('ACTIVATE_UPDATE'); };
    document.body.append(notice);
  };
  const warm=()=>registration.active?.postMessage('PREPARE_ASSETS');
  if('requestIdleCallback' in window)window.requestIdleCallback(warm,{timeout:10000});else setTimeout(warm,10000);
  show();
  registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', show));
}

// Keep the standalone fallback bootstrap in the client graph without executing it in Start.
window.addEventListener('lightscore:offline-bootstrap', () => void import('./offline-entry'));

window.addEventListener('vite:preloadError', event => {event.preventDefault();if(confirm(document.documentElement.lang==='de'?'Neue Version verfügbar. Jetzt neu laden?':'New version available. Reload now?'))location.reload();});
