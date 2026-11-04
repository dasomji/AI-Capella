import { logError } from './logger.server';
const pending = new Set<Promise<unknown>>();
export function trackBackground(task: Promise<unknown>) {
  const tracked = task.catch(error => logError('auth.background', error)).finally(() => pending.delete(tracked));
  pending.add(tracked);
}
export async function flushBackground() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([Promise.allSettled([...pending]), new Promise<void>(resolve => { timer = setTimeout(resolve, 5000); })]); }
  finally { clearTimeout(timer); }
}
