// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { scanDesignFile, checkBaseline, mergeNewRules, checkGrowth, ruleVersions } from '../scripts/check-design-tokens.mjs';
const scan = source => scanDesignFile('src/new-screen.tsx', source);
const aggregate = rows => rows.map(row => ({ ...row, count: 1 }));

describe('design token guard', () => {
  it.each([
    'el.style.color = "#123456";', 'ctx.fillStyle = "white";',
    'ctx.strokeStyle = "hsl(20, 60%, 40%)";',
    'const voice = `hsl(${hue}, 70%, 72%)`;',
    'const rgb = [12, 34, 56]; const tint = `rgb(${rgb.join(",")})`; ctx.fillStyle = tint;',
    'const channels = "12,34,56"; ctx.fillStyle = `rgba(${channels},0.5)`;',
    'ctx.fillStyle = `rgba(12,34,56,${alpha})`;',
    'const rgb = dark ? [12,34,56] : [78,90,12]; ctx.addColorStop(.5,`rgb(${rgb})`);',
    'el.setAttribute("fill", "red");',
    'const x = <div className="tw:bg-red-500 tw:font-sans" />;',
    'const x = <div className="tw:hover:bg-[#123456]" />;',
    'const x = <div className="tw:rounded-[7px]" />;',
    'ctx.font = "12px Atkinson Hyperlegible Next Variable, sans-serif";',
  ])('rejects new pigment/font bypass: %s', source => {
    const rows = aggregate(scan(source));
    expect(rows.length).toBeGreaterThan(0);
    expect(checkBaseline(rows, [], []).some(e => e.startsWith('NEW'))).toBe(true);
  });
  it('permits semantic roles, geometry triples and runtime channels', () => {
    expect(scan('const point = [12,34,56]; el.style.color = theme.colors.ink.css; const x = <div className="tw:bg-surface tw:font-body"/>;')).toEqual([]);
  });
  it('forbids every non-empty baseline, including exact current/ceiling matches', () => {
    const rows = aggregate(scan('el.style.color = "#123456";'));
    expect(checkBaseline([], rows, rows)[0]).toContain('NONEMPTY');
    expect(checkBaseline(rows, rows, rows)).toEqual(expect.arrayContaining([expect.stringContaining('NONEMPTY'), expect.stringContaining('NEW')]));
    expect(checkBaseline([], [], rows)).toEqual([]);
  });
  it('catches scoped component CSS and forbidden recipe imports', () => {
    expect(scanDesignFile('src/new.css', '.screen button { color: navy; font-family: Georgia, serif; }').map(row => row.kind)).toEqual(expect.arrayContaining(['named-color', 'raw-font', 'screen-control-selector']));
    expect(scanDesignFile('src/design-system/recipes/button.ts', 'import React from "react";')[0].kind).toBe('recipe-boundary');
  });
});

describe('review guard regressions M3–M6 / N1', () => {
  it.each(['Georgia', '"Inter", Arial', '12px Helvetica'])('M3 rejects unknown CSS fonts: %s', value => {
    expect(scanDesignFile('src/new.css', `x { ${value.startsWith('12') ? 'font' : 'font-family'}: ${value} }`).some(row => row.kind === 'font-allowlist')).toBe(true);
  });
  it.each(["ctx.font='12px Georgia'", "ctx.font='12px Inter, Arial'", "ctx.font=legacyFont", "el.style.fontFamily='Georgia'", "ctx['font']='12px Helvetica'", "ctx.font=`12px Georgia ${theme.fonts.body}`"] )('M3 rejects font sinks: %s', source => {
    expect(scan(source).some(row => row.kind === 'font-allowlist')).toBe(true);
  });
  it('M3 permits snapshot fonts, variable shorthands and inheritance', () => {
    expect(scan("const body = theme.fonts.body; ctx.font = `12px ${body}`; ctx.fontFamily = theme.fonts['mono']; el.style.fontFamily='inherit';")).toEqual([]);
    expect(scanDesignFile('src/new.css', 'x{font:italic 12px var(--ds-font-body);font-family:initial} x{font:500 clamp(32px,4vw,44px)/1.2 var(--ds-font-display)}')).toEqual([]);
  });
  it.each(['filter:drop-shadow(0 0 4px gold)', 'text-decoration:underline red', 'scrollbar-color:red blue'])('M4 scans every CSS value: %s', decl => {
    expect(scanDesignFile('src/new.css', `x{${decl}}`).some(row => row.kind === 'named-color')).toBe(true);
  });
  it.each(["el.style.cssText='border:1px solid red'", "el.style.background='linear-gradient(red, blue)'", "el.style.boxShadow='0 0 4px gold'", "el.style.setProperty('filter','drop-shadow(0 0 4px gold)')", "ctx.shadowColor='red blue'", "const shadow='0 0 4px gold'; el.style.boxShadow=shadow"])('M4 scans visual sink tokens: %s', source => {
    expect(scan(source).some(row => row.kind === 'named-color')).toBe(true);
  });
  it('M4 skips URLs, variable identifiers, font families, animations and content', () => {
    expect(scanDesignFile('src/new.css', 'x{background:url("gold/red.png");color:var(--ds-red);animation-name:red;content:"blue";font-family:var(--ds-font-body)}')).toEqual([]);
    expect(scan("el.style.background='url(red.png)'; el.style.boxShadow='0 0 var(--ds-gold)';")).toEqual([]);
  });
  it.each(['import x from "../../ui"', 'import x from "../../audioEngine"', 'import("react")', 'export * from "react"', 'export {x} from "../theme"', 'import("./../../ui")', 'import(path)'])('M5 recipe allowlist rejects %s', source => {
    expect(scanDesignFile('src/design-system/recipes/button.ts', source).some(row => row.kind === 'recipe-boundary')).toBe(true);
  });
  it('M5 permits recipe dependencies and token types only', () => {
    expect(scanDesignFile('src/design-system/recipes/button.ts', 'import {x} from "./base"; export * from "../recipes/base"; import type {ThemeSnapshot} from "../theme";')).toEqual([]);
    expect(scanDesignFile('src/design-system/recipes/button.ts', 'import {readTheme} from "../theme";').some(row => row.kind === 'recipe-boundary')).toBe(true);
  });
  it.each([
    ['computed-style-token-read', "getComputedStyle(document.body).getPropertyValue('--ds-ink')"],
    ['raw-media-query', "matchMedia('(max-width:800px)')"],
    ['raw-breakpoint-compare', 'window.innerWidth < 700'],
    ['legacy-theme-read', 'document.documentElement.dataset.design'],
    ['unlayered-css-import', 'import "./new.css"'],
    ['unlayered-css-import', 'import("./new.css")'],
    ['unlayered-css-import', 'export * from "./new.css"'],
  ])('M5 rejects accessor/layer bypass %s', (kind, source) => {
    expect(scan(source).some(row => row.kind === kind)).toBe(true);
  });
  it('M5 covers CSS media and imports, allowing layered imports and system preferences', () => {
    expect(scanDesignFile('src/new.css', '@media (max-width: 800px){x{display:none}} @import "x.css";').map(row => row.kind)).toEqual(['raw-media-query','unlayered-css-import']);
    expect(scanDesignFile('src/new.css', '@import "x.css" layer(components);')).toEqual([]);
    expect(scanDesignFile('src/design-system/tokens.css', '@import "x.css"; :root[data-theme=night]{--ds-ink:#123456}').map(row=>row.kind)).toEqual(['unlayered-css-import']);
    expect(scan("matchMedia('(prefers-color-scheme:light)'); matchBreakpoint('panel','below');")).toEqual([]);
  });
  it.each(['p-[13px]', 'z-[9999]', 'w-[420px]', 'gap-[7px]', 'max-w-[90vw]', 'inset-x-[3rem]', 'basis-[50%]', 'm-(--legacy-space)', 'w-[var(--legacy-width)]'])('M6 rejects arbitrary layout %s', value => {
    expect(scan(`const cls='tw:hover:${value}';`).some(row => row.kind === 'arbitrary-aesthetic')).toBe(true);
  });
  it('M6 permits semantic arbitrary variables and semantic scales', () => {
    expect(scan("const cls='tw:p-(--ds-space-control) tw:z-[var(--ds-layer-menu)] tw:max-panel:w-control tw:p-control';")).toEqual([]);
  });
  it('cannot revive the retired baseline mechanism through upgraded rules', () => {
    const row = {file:'src/old.ts',kind:'raw-color',context:'old',value:'#123456',count:1};
    expect(() => mergeNewRules([row], {entries:[]}, [row])).toThrow('forbidden');
    expect(checkGrowth({entries:[row]}, {entries:[row]})[0]).toContain('NONEMPTY');
  });
  it.each(['1px','2rem','.3em','10ms','1.5s','50%','calc(100% - 2px)','var(--ds-gap, 3px)'])('requires component CSS dimensions/durations to use tokens: %s', value => {
    expect(scanDesignFile('src/design-system/example.css', `x { width:${value} }`).some(row=>row.kind==='raw-css-dimension')).toBe(true);
  });
  it('permits token dimensions, zero, full extents and non-dimensional asset identities', () => {
    expect(scanDesignFile('src/design-system/example.css', 'x{padding:0; width:100%; height:var(--ds-height); transition:var(--ds-transition); background:url("size-12px.svg")}')).toEqual([]);
  });
  it('keeps non-theme exceptions narrow and structural', () => {
    expect(scanDesignFile('src/staffView.ts', "const from=shape.filled ? 'black' : 'half';")).toEqual([]);
    expect(scanDesignFile('src/staffView.ts', "ctx.fillStyle='black';").some(r=>r.kind==='named-color')).toBe(true);
    expect(scanDesignFile('src/paper.ts', 'const specs={formation:[[12,12,.4]]}; ctx.fillStyle=specs;')).toEqual([]);
    expect(scanDesignFile('src/paper.ts', 'const color=[12,12,.4]; ctx.fillStyle=color;').some(r=>r.kind==='raw-channels-at-sink')).toBe(true);
    expect(scanDesignFile('src/design-system/example.css', ':root[data-design="papier"] x {display:none}').some(r=>r.kind==='legacy-theme-selector')).toBe(true);
  });
});

describe('final review guard evasions', () => {
  it.each(['theme', 'type', 'design', 'ground'])('rejects %s selectors and attribute reads', name => {
    expect(scanDesignFile('src/design-system/native.css', `[data-${name}=parchment] {display:none}`).some(r=>r.kind==='legacy-theme-selector')).toBe(true);
    expect(scan(`root.getAttribute('data-${name}')`).some(r=>r.kind==='legacy-theme-read')).toBe(true);
    expect(scan(`const x='tw:[[data-${name}=parchment]_&]:block'`).some(r=>r.kind==='legacy-theme-selector')).toBe(true);
  });
  it('requires layer() on every app import', () => {
    expect(scanDesignFile('src/design-system/app.css', '@import "x.css";').some(r=>r.kind==='unlayered-css-import')).toBe(true);
    expect(scanDesignFile('src/design-system/app.css', '@import "x.css" layer(components);')).toEqual([]);
  });
  it.each(['translate-x-[13px]', 'grid-cols-[13px_1fr]', 'animate-[spin_1s]', 'rotate-[15deg]', 'content-[hello]'])('checks arbitrary utility %s', cls => {
    expect(scan(`const x='tw:hover:${cls}'`).some(r=>r.kind==='arbitrary-aesthetic')).toBe(true);
  });
  it.each(['duration-300','z-50','border-2','rounded-full','opacity-37'])('rejects unmapped scales %s', cls => {
    expect(scan(`const x='tw:${cls}'`).some(r=>r.kind==='unmapped-scale-utility')).toBe(true);
  });
  it.each(['@media (max-width:700px){x{display:none}}', '@custom-variant phone (@media (max-width:700px));'])('checks at-rule breakpoint parameters %s', css => {
    expect(scanDesignFile('src/design-system/native.css', css).some(r=>r.kind==='raw-media-query')).toBe(true);
  });
  it.each(['ctx.fillStyle=`rgb(${r},${g},${b})`', 'const tint=`rgb(${r},${g},${b})`; el.style.background=tint', 'ctx.addColorStop(0, `rgba(${r},${g},${b},${alpha})`)'])('rejects computed color sinks %s', source => {
    expect(scan(source).some(r=>r.kind==='computed-color-at-sink')).toBe(true);
  });
  it('rejects rule-index and value-encoding names without rejecting semantic spacing scales', async () => {
    const {checkSemanticName} = await import('../scripts/check-design-tokens.mjs');
    for (const name of ['--ds-panel-bpm-radius-39','shell-0031-0','player-native-height-4px']) expect(checkSemanticName(name),name).toBe(true);
    for (const name of ['--ds-space-control','--spacing-content','--ds-radius-card','tw:p-control']) expect(checkSemanticName(name),name).toBe(false);
  });
});

it('rejects shared screen pigments while retaining explicit print exceptions', () => {
  const css=':root{--ds-cover-background:#15131f;--ds-ink:var(--pigment-ink);--ds-print-paper:#fff;--ds-print-ink:#000} :root[data-theme="new"]{--ds-cover-background:#25231f}';
  expect(scanDesignFile('src/design-system/tokens.css',css).filter(r=>r.kind==='shared-screen-color').map(r=>r.context)).toEqual(['--ds-cover-background','--ds-ink']);
});
it.each([
  ['src/design-system/tokens.css', ':root{--ds-panel-bpm-radius-39:var(--ds-radius-card)}'],
  ['src/design-system/app.css', '@utility shell-0031-0{display:block} @custom-variant player-0032-0 (&:hover);'],
  ['src/new.ts', 'const x="tw:player-native-height-4px";'],
])('enforces semantic names when enabled: %s', (file,source) => {
  expect(scanDesignFile(file,source,{semanticNames:true}).some(r=>r.kind==='value-encoding-name')).toBe(true);
});

it.each(['tw:[transform:var(--ds-panel-specimen-transform)]', 'tw:focus-visible:[outline-color:var(--ds-admin-accent)]', 'tw:border-(length:--ds-stroke-thin)', 'tw:w-[length:var(--ds-control-height)]'])('accepts semantic arbitrary property and typed token utility %s', cls => {
  expect(scan(`const x='${cls}'`)).toEqual([]);
});

it.each(['scale-110','rotate-45','brightness-125','underline-offset-2'])('rejects other unmapped numeric design scales %s', cls => {
  expect(scan(`const x='tw:${cls}'`).some(r=>r.kind==='unmapped-scale-utility')).toBe(true);
});
it('checks reversed raw media ranges and aliased computed colors', () => {
  expect(scanDesignFile('src/design-system/native.css','@media (700px >= width){x{display:none}}').some(r=>r.kind==='raw-media-query')).toBe(true);
  expect(scan('const a=`rgb(${r},${g},${b})`;const b=a;ctx.fillStyle=b').some(r=>r.kind==='computed-color-at-sink')).toBe(true);
});

it.each(['tw:[line-height:inherit]','tw:[background:var(--c)]','tw:[transform:perspective(var(--ds-perspective))_rotateX(calc(var(--ry,_var(--ds-rest))_*_var(--ds-tilt)))]'])('permits token expressions and named structural inputs %s', cls => {
  expect(scan(`const x='${cls}'`)).toEqual([]);
});
it.each(['tw:[transform:translateX(13px)_var(--ds-transform)]','tw:[background:linear-gradient(red,_var(--ds-ground))]','tw:[color:var(--legacy-color)]'])('still rejects aesthetic fragments around semantic variables %s', cls => {
  expect(scan(`const x='${cls}'`).some(r=>r.kind==='arbitrary-aesthetic'||r.kind==='named-color')).toBe(true);
});

it('permits named element-local writing inputs inside token-backed material expressions', () => {
  expect(scan("const x='tw:[mask-image:linear-gradient(var(--ds-writing-angle),_var(--ds-writing-ink)_calc(var(--written)_-_var(--ds-writing-feather)),_transparent_var(--written))]'")).toEqual([]);
});
