/* Canonical pre-paint resolver. This exact source also runs inline; keep it self-contained. */
export const themeRegistry = /** @type {const} */ ([
    { id: 'night-paper', menuLabel: 'designNight', label: 'Night paper', aliases: ['papier'], storage: 'papier', defaultStart: null, colorScheme: 'dark', system: 'dark' },
    { id: 'parchment', menuLabel: 'designParchment', label: 'Parchment', aliases: ['pergament'], storage: 'pergament', defaultStart: null, colorScheme: 'light', system: 'light' },
    { id: 'velvet', menuLabel: null, label: 'Velvet', aliases: ['samt'], storage: 'samt', defaultStart: 'heute', colorScheme: 'dark', system: null },
]);
/** @param {string | null} value */
export function themePreference(value) {
    return themeRegistry.find(theme => theme.id === value || theme.aliases.some(alias => alias === value))?.id ?? 'system';
}
/** @param {typeof themeRegistry[number]['id'] | 'system'} [next] */
export default function bootstrapTheme(next) {
    const root = document.documentElement;
    function choice(param, key, values, fallback) {
        const asked = new URLSearchParams(location.search).get(param);
        let stored = null;
        try {
            if (asked === fallback) localStorage.removeItem(key);
            else if (asked && values.includes(asked)) localStorage.setItem(key, asked);
            stored = localStorage.getItem(key);
        } catch { /* Device storage is optional; URL choices still work for this visit. */ }
        if (asked && values.includes(asked)) return asked;
        return stored && values.includes(stored) ? stored : fallback;
    }
    const choices = ['auto', 'system', ...themeRegistry.flatMap(theme => [theme.id, ...theme.aliases])];
    const selected = next ?? themePreference(choice('design', 'ai-capella-design', choices, 'auto'));
    let light = false;
    try { light = matchMedia('(prefers-color-scheme: light)').matches; } catch { /* Dark default. */ }
    const theme = themeRegistry.find(theme => selected === 'system' ? theme.system === (light ? 'light' : 'dark') : theme.id === selected) ?? themeRegistry[0];
    const type = choice('schrift', 'ai-capella-schrift', ['neu', 'bodoni', 'heute', 'test'], 'neu');
    const start = theme.defaultStart ?? choice('start', 'ai-capella-start', ['neu', 'heute', 'zeile', 'buehne'], 'neu');
    root.dataset.theme = theme.id;
    root.style.colorScheme = theme.colorScheme;
    root.dataset.themePreference = selected;
    if (type !== 'bodoni' && type !== 'heute') root.dataset.type = 'revival';
    else delete root.dataset.type;
    if (start !== 'heute') root.dataset.start = 'neu';
    else delete root.dataset.start;
    if (start === 'zeile' || start === 'buehne') root.dataset.title = start;
    else delete root.dataset.title;
    const chrome = getComputedStyle(root).getPropertyValue('--ds-browser-chrome').trim();
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.append(meta);
    }
    if (chrome) meta.setAttribute('content', chrome);
    return { id: theme.id, preference: selected, revival: type !== 'bodoni' && type !== 'heute', start };
}
