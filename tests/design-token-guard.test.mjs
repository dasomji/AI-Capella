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
  it('rejects stale baseline entries and attempts to expand the baseline', () => {
    const rows = aggregate(scan('el.style.color = "#123456";'));
    expect(checkBaseline([], rows, rows)[0]).toContain('STALE');
    expect(checkBaseline(rows, rows, [])[0]).toContain('BASELINE GREW');
    expect(checkBaseline(rows, rows, rows)).toEqual([]);
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
    expect(scanDesignFile('src/design-system/tokens.css', '@import "x.css"; :root{--ds-ink:#123456}').map(row=>row.kind)).toEqual(['unlayered-css-import']);
    expect(scan("matchMedia('(prefers-color-scheme:light)'); matchBreakpoint('panel','below');")).toEqual([]);
  });
  it.each(['p-[13px]', 'z-[9999]', 'w-[420px]', 'gap-[7px]', 'max-w-[90vw]', 'inset-x-[3rem]', 'basis-[50%]', 'm-(--legacy-space)', 'w-[var(--legacy-width)]'])('M6 rejects arbitrary layout %s', value => {
    expect(scan(`const cls='tw:hover:${value}';`).some(row => row.kind === 'arbitrary-aesthetic')).toBe(true);
  });
  it('M6 permits semantic arbitrary variables and semantic scales', () => {
    expect(scan("const cls='tw:p-(--ds-space-12) tw:z-[var(--ds-layer-menu)] tw:max-panel:w-24 tw:p-2';")).toEqual([]);
  });
  it('N1 merges only upgraded rules with exact immutable-ceiling membership', () => {
    const row = { file:'src/old.ts', kind:'font-allowlist', context:'old', value:'12px Georgia', count:1 };
    const previous = { entries:[] };
    const merged = mergeNewRules([row], previous, [row]);
    expect(merged.entries).toEqual([row]);
    expect(checkBaseline([row], merged.entries, [row])).toEqual([]);
    expect(checkGrowth(merged, previous)).toEqual([]);
    expect(() => mergeNewRules([row], previous, [])).toThrow('production ceiling');
    expect(() => mergeNewRules([{...row,count:2}], previous, [row])).toThrow('production ceiling');
    expect(() => mergeNewRules([row], {entries:[],ruleVersions}, [row])).toThrow('not new');
    expect(checkGrowth({entries:[row],ruleVersions}, {entries:[],ruleVersions})[0]).toContain('GREW');
    const legacy = {...row,kind:'raw-color'};
    expect(() => mergeNewRules([legacy], previous, [legacy])).toThrow('not new');
  });
});
