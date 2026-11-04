import { off } from './offline-text';
export async function registerOfflineWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.MODE === 'development') return;
  const registration = await navigator.serviceWorker.register('/sw.js');
  const show = () => {
    if (!registration.waiting) {document.querySelector('#offline-update')?.remove();return;}
    if (!registration.active || document.querySelector('#offline-update')) return;
    const notice = document.createElement('button');
    notice.id = 'offline-update'; notice.className = 'btn'; notice.textContent = off('update');
    notice.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:40';
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
