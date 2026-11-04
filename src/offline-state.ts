let unavailable = typeof navigator !== 'undefined' && !navigator.onLine;
export const isOffline = () => unavailable || !navigator.onLine;
export function setOffline(value: boolean) { if (unavailable === value) return; unavailable = value; window.dispatchEvent(new Event('offline:changed')); }
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => setOffline(true));
  // Online is only a hint: authorized HTTP checks must succeed before enabling writes.
  window.addEventListener('online', () => window.dispatchEvent(new Event('membership:refresh')));
}
