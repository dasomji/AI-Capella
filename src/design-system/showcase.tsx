import { useEffect, useRef } from 'react';
import { specimens } from './catalog';
import { useTheme } from './theme/react';
import { colorRoles, setThemePreference, themeRegistry } from './theme';
import type { ThemePreference } from './theme';

function DomSpecimen({build}:{build:()=>HTMLElement}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ const node=build();ref.current?.replaceChildren(node);return()=>node.remove(); },[build]);
  return <div data-renderer="dom" ref={ref}/>;
}
const examples=specimens();
/** Development-only comparisons; production routing eliminates this entire graph. */
export function DesignSystemShowcase() {
  const theme = useTheme();
  return <main className="tw:bg-surface tw:text-ink tw:font-body tw:p-section">
    <h1 className="tw:font-heading">LightScore design tokens</h1>
    <label>Theme <select aria-label="Theme" value={theme?.preference ?? 'system'} onChange={event => setThemePreference(event.target.value as ThemePreference)}>
      <option value="system">System</option>{themeRegistry.map(theme => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
    </select></label>
    <p>{theme?.id} · {theme?.type} · revision {theme?.revision}</p>
    <h2>Shared primitives · React / DOM</h2>
    <p>Every named variant, state and slot uses the same typed recipe. Dialog specimens are nonmodal; open a modal with the behavior controls.</p>
    <button type="button" onClick={async()=>{const {createDialog,createButton}=await import('./dom');const close=createButton({text:'Close',onClick:()=>modal.close()});const modal=createDialog({title:'Keyboard and focus',body:'Escape and outside click close this modal.',actions:close});modal.open();}}>Open lifecycle example</button>
    <div className="ds-specimens tw:grid tw:gap-section">{examples.map(example=><section key={example.name} data-specimen={example.name}><h3>{example.name}</h3><div className="ds-specimen-pair tw:grid tw:grid-cols-2 tw:gap-section tw:[&>div]:min-w-flush tw:[&>div]:relative tw:[&>div]:[transform:var(--ds-roll-staff-transform)] tw:[&_dialog]:relative! tw:[&_dialog]:inset-auto! tw:[&_dialog]:m-flush! tw:[&_dialog]:w-full! tw:[&_dialog]:h-auto! tw:[&_dialog]:max-w-full! tw:[&_dialog]:max-h-none!"><div data-renderer="react">{example.react}</div><DomSpecimen build={example.dom}/></div></section>)}</div>
    <h2 className="tw:font-display">Semantic color roles</h2>
    <div className="tw:flex tw:flex-wrap tw:gap-section">
      {theme && colorRoles.map(role => <article key={role} className="tw:border-(length:--ds-stroke-thin) tw:border-solid tw:border-rule tw:rounded-card tw:p-control">
        <div aria-hidden="true" className="tw:h-stage tw:w-stage" style={{ backgroundColor: theme.colors[role].css }} />
        <code>{role}</code><p>{theme.colors[role].css}</p>
      </article>)}
    </div>
    <h2>Voice spectrum</h2><div className="tw:flex tw:gap-control">{theme?.spectrum.map((color, index) => <span key={index} className="tw:p-control" style={{ backgroundColor: color.css, color: theme.colors['surface-sunken'].css }}>{index + 1}</span>)}</div>
    <h2>Font roles</h2>{theme && Object.entries(theme.fonts).map(([role, family]) => <p key={role} style={{ fontFamily: family }}>{role}: LightScore · Abendmusik · 123</p>)}
    <h2>All semantic values</h2><dl>{theme && Object.entries(theme.roles).map(([role, value]) => <div key={role}><dt><code>{role}</code></dt><dd>{value}</dd></div>)}</dl>
  </main>;
}
