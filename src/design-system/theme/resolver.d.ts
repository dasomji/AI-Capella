import type { ThemeId, ThemePreference } from './bootstrap';
export default function bootstrapTheme(next?: ThemePreference): {
  readonly id: ThemeId;
  readonly preference: ThemePreference;
  readonly revival: boolean;
  readonly start: string;
};
