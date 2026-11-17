/* Canonical pre-paint resolver. This exact source also runs inline; keep it self-contained. */
export const themeRegistry = /** @type {const} */ ([
    { id: 'night-paper', menuLabel: 'designNight', label: 'Night paper', aliases: ['papier'], storage: 'papier', defaultStart: null, system: 'dark' },
    { id: 'parchment', menuLabel: 'designParchment', label: 'Parchment', aliases: ['pergament'], storage: 'pergament', defaultStart: null, system: 'light' },
    { id: 'velvet', menuLabel: null, label: 'Velvet (experimental)', aliases: ['samt'], storage: 'samt', defaultStart: null, system: null },
]);
/** Retained only as named experimental device presets; never main appearance choices. */
export const experimentalPresets = /** @type {const} */ ([
    { id: 'velvet', label: 'Velvet', parameter: 'design', value: 'samt' },
    { id: 'earlier-title', label: 'Earlier title', parameter: 'start', value: 'heute' },
    { id: 'staff-title', label: 'Staff title draft', parameter: 'start', value: 'zeile' },
    { id: 'stage-title', label: 'Stage title draft', parameter: 'start', value: 'buehne' },
    { id: 'ribbon-draft', label: 'Earlier ribbon draft', parameter: 'logo', value: '1' },
    { id: 'night-fibres', label: 'Night fibres', parameter: 'papier', value: 'nacht' },
    { id: 'handmade-paper', label: 'Handmade paper', parameter: 'papier', value: 'buetten' },
    { id: 'washi-paper', label: 'Washi paper', parameter: 'papier', value: 'washi' },
    { id: 'bodoni-type', label: 'Bodoni type', parameter: 'schrift', value: 'bodoni' },
    { id: 'gel-roll', label: 'Gel roll override', parameter: 'roll', value: 'gel' },
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
    const start = choice('start', 'ai-capella-start', ['neu', 'heute', 'zeile', 'buehne'], 'neu');
    root.dataset.theme = theme.id;
    // tokens.css owns the scheme; a stale inline value would override theme edits.
    root.style.removeProperty('color-scheme');
    root.style.colorScheme = getComputedStyle(root).getPropertyValue('--ds-color-scheme').trim();
    root.dataset.themePreference = selected;
    if (type !== 'bodoni' && type !== 'heute') root.dataset.type = 'revival';
    else delete root.dataset.type;
    if (start !== 'heute') root.dataset.start = 'neu';
    else delete root.dataset.start;
    if (start === 'zeile' || start === 'buehne') root.dataset.title = start;
    else delete root.dataset.title;
    const choicesByParameter = {
        design: theme.aliases[0], start, schrift: type === 'heute' ? 'bodoni' : type,
        logo: choice('logo', 'ai-capella-logo', ['1', '2'], '2'),
        papier: choice('papier', 'ai-capella-papier', ['verge', 'nacht', 'buetten', 'washi'], 'verge'),
        roll: choice('roll', 'ai-capella-roll', ['lantern', 'gel'], 'lantern'),
    };
    const experiments = experimentalPresets.filter(preset => choicesByParameter[preset.parameter] === preset.value).map(preset => preset.id);
    if (experiments.length) root.dataset.experimental = experiments.join(' ');
    else delete root.dataset.experimental;
    const chrome = getComputedStyle(root).getPropertyValue('--ds-browser-chrome').trim();
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.append(meta);
    }
    if (chrome) meta.setAttribute('content', chrome);
    return { id: theme.id, preference: selected, revival: type !== 'bodoni' && type !== 'heute', start, experiments };
}
