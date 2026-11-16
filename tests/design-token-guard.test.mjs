// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { scanDesignFile, checkBaseline } from '../scripts/check-design-tokens.mjs';
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
