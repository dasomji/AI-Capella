// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as r from '../src/design-system/recipes';
import { scanDesignFile } from '../scripts/check-design-tokens.mjs';
describe('pure recipes', () => {
    it('keeps the legacy notifier on its established CSS during screen migration', () => { expect(r.toastRecipe({ variant: 'legacy' })).not.toContain('ds-reset'); expect(r.toastRecipe()).toContain('ds-reset'); });
    it('have zero guard violations, forbidden imports or runtime dependencies', () => {
        for (const file of readdirSync('src/design-system/recipes')) {
            const source = readFileSync('src/design-system/recipes/' + file, 'utf8');
            expect(scanDesignFile('src/design-system/recipes/' + file, source)).toEqual([]);
        }
        expect(scanDesignFile('src/design-system/recipes/bad.ts', 'export { createButton } from "../dom"')).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'recipe-boundary' })]));
    });
    it('has exactly one shape, height, font, size and intent per button variant', () => {
        for (const variant of r.buttonVariants)
            for (const intent of ['secondary', 'primary', 'danger', 'quiet'] as const) {
                const classes = r.buttonRecipe({ variant, intent }).split(/\s+/);
                for (const group of [/^tw:min-h-/, /^tw:rounded-/, /^tw:text-(button|label|body-small)$/, /^tw:font-(control|auth-mono|auth-body)$/, /^tw:bg-/])
                    expect(classes.filter(c => group.test(c))).toHaveLength(1);
                expect(new Set(classes).size).toBe(classes.length);
            }
        expect(r.buttonRecipe()).toContain('tw:min-h-control-height');
        expect(r.buttonRecipe({ variant: 'pill' })).not.toContain('tw:rounded-card');
        expect(r.buttonRecipe({ variant: 'dense' })).toContain('tw:rounded-admin-control');
    });
    it('makes ruled and boxed properties exclusive and exposes stable slots', () => { for (const variant of r.fieldVariants) {
        const slots = r.fieldRecipe({ variant });
        expect(Object.keys(slots)).toEqual(['root', 'label', 'control', 'hint', 'error']);
        expect(slots.control.includes('tw:rounded-card')).toBe(variant === 'boxed');
        expect(slots.control.includes('tw:rounded-field')).toBe(variant !== 'boxed');
    } });
});
