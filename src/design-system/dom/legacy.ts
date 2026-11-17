/** Retained main-screen signatures: breakpoint helper and icon-name menu data. */
import { matchBreakpoint } from '../theme';
import type { IconName } from '../../icons';
export { closeOverlay } from '../behavior/dialog';
export function isNarrow(): boolean { return matchBreakpoint('panel','below').matches; }
export interface MenuItem {
  label: string;
  icon?: IconName;
  // A sign from the music font (Bravura) shown in place of the icon: a clef, say.
  glyph?: { text: string; kind: string };
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  onSelect: () => void;
  // A choice that opens in place: the item shows the chosen one (`value`) and, clicked, its
  // `options` below it; the menu stays open until one of them is picked.
  options?: MenuItem[];
  value?: string;
}

