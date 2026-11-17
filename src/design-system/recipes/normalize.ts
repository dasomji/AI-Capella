/** Component-local reset travels with every slot, keeping legacy ancestor CSS out. */
export function normalizeRecipe<T>(value: T): T {
    if (typeof value === 'string')
        return [...new Set(['ds-reset', ...value.split(/\s+/).filter(Boolean)])].join(' ') as T;
    if (typeof value === 'function')
        return ((...args: unknown[]) => normalizeRecipe(value(...args))) as T;
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, slot]) => [key, normalizeRecipe(slot)])) as T;
    return value;
}
