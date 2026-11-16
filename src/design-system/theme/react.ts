import { useSyncExternalStore } from 'react';
import { readTheme, subscribeTheme } from './index';
import type { ThemeSnapshot } from './index';
const subscribe = (notify: () => void) => subscribeTheme(notify);
const serverSnapshot = (): ThemeSnapshot | undefined => undefined;
/** SSR/hydration returns undefined; client rendering receives the cached snapshot. */
export function useTheme(): ThemeSnapshot | undefined {
  return useSyncExternalStore(subscribe, readTheme, serverSnapshot);
}
