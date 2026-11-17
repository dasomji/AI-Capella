// @vitest-environment node
import {expect,it} from 'vitest';
import {scanDesignFile} from '../scripts/check-design-tokens.mjs';
const scan=source=>scanDesignFile('src/design-system/tokens.css',source);
it.each(['--ds-widget-gap:12px','--ds-widget-pad:4px 8px','--ds-widget-offset:-2px'])('composes an equal scale step in %s',decl=>{
 expect(scan(`:root{--ds-space-control:12px;--ds-space-compact:4px;--ds-space-small:8px;--ds-space-micro:2px;${decl}}`).some(r=>r.kind==='uncomposed-scale-length')).toBe(true);
});
it.each(['--ds-widget--gap','--ds-'+('very-long-role-'.repeat(4))+'gap'])('rejects invalid role name %s',name=>{
 expect(scan(`:root{${name}:var(--ds-space-control)}`).some(r=>r.kind==='token-name-shape')).toBe(true);
});
it('allows actual scales, references, and unmatched retained geometry',()=>{
 expect(scan(':root{--ds-space-control:12px;--ds-widget-gap:var(--ds-space-control);--ds-retained-height:123.123px}')).toEqual([]);
});
it.each(['--ds-widget-padding:0 var(--ds-space-control)','--ds-widget-border-radius:0'])('composes zero geometry in %s',decl=>{
 expect(scan(`:root{--ds-space-none:0px;${decl}}`).some(r=>r.kind==='uncomposed-scale-length')).toBe(true);
});
it('preserves unitless arithmetic zero separately from geometric lengths',()=>{
 expect(scan(':root{--ds-space-none:0px;--ds-leading-none:0;--ds-library-card-rest:0;--ds-widget-padding:var(--ds-space-none)}')).toEqual([]);
});
