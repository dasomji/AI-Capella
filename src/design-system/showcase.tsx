import { useEffect, useState } from 'react';
import { colorRoles, readTheme, setThemePreference, subscribeTheme } from './theme';
import type { ThemePreference, ThemeSnapshot } from './theme';

/** Development-only foundation. P3 adds recipes and both component adapters here. */
export function DesignSystemShowcase() {
  const [theme, setTheme] = useState<ThemeSnapshot>();
  useEffect(() => { setTheme(readTheme()); return subscribeTheme(setTheme); }, []);
  return <main className="tw:bg-surface tw:text-ink tw:font-body tw:p-content">
    <h1 className="tw:font-heading">LightScore design tokens</h1>
    <label>Theme <select aria-label="Theme" value={theme?.preference ?? 'system'} onChange={event => setThemePreference(event.target.value as ThemePreference)}>
      <option value="system">System</option><option value="night-paper">Night paper</option><option value="parchment">Parchment</option><option value="velvet">Velvet</option>
    </select></label>
    <p>{theme?.id} · {theme?.type} · revision {theme?.revision}</p>
    <h2 className="tw:font-display">Semantic color roles</h2>
    <div className="tw:flex tw:flex-wrap tw:gap-content">
      {theme && colorRoles.map(role => <article key={role} className="tw:border tw:border-solid tw:border-rule tw:rounded-card tw:p-control">
        <div aria-hidden="true" className="tw:h-swatch tw:w-swatch" style={{ backgroundColor: theme.colors[role].css }} />
        <code>{role}</code><p>{theme.colors[role].css}</p>
      </article>)}
    </div>
    <h2>Voice spectrum</h2><div className="tw:flex tw:gap-control">{theme?.spectrum.map((color, index) => <span key={index} className="tw:p-control" style={{ backgroundColor: color.css, color: theme.colors['surface-sunken'].css }}>{index + 1}</span>)}</div>
    <h2>Font roles</h2>{theme && Object.entries(theme.fonts).map(([role, family]) => <p key={role} style={{ fontFamily: family }}>{role}: LightScore · Abendmusik · 123</p>)}
    <h2>All semantic values</h2><dl>{theme && Object.entries(theme.roles).map(([role, value]) => <div key={role}><dt><code>{role}</code></dt><dd>{value}</dd></div>)}</dl>
  </main>;
}
