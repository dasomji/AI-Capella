/* Canonical pre-paint resolver. This exact source also runs inline; keep it self-contained. */
export default function bootstrapTheme(next) {
    const root = document.documentElement;
    function choice(param, key, values, fallback) {
        const asked = new URLSearchParams(location.search).get(param);
        let stored = null;
        try {
            if (asked === fallback)
                localStorage.removeItem(key);
            else if (asked && values.includes(asked))
                localStorage.setItem(key, asked);
            stored = localStorage.getItem(key);
        }
        catch { /* Device storage is optional; URL choices still work for this visit. */ }
        if (asked && values.includes(asked))
            return asked;
        return stored && values.includes(stored) ? stored : fallback;
    }
    const designs = {
        auto: 'system', system: 'system', papier: 'night-paper', 'night-paper': 'night-paper',
        pergament: 'parchment', parchment: 'parchment', samt: 'velvet', velvet: 'velvet',
    };
    const selected = next ?? designs[choice('design', 'ai-capella-design', Object.keys(designs), 'auto')];
    let light = false;
    try {
        light = matchMedia('(prefers-color-scheme: light)').matches;
    }
    catch { /* Dark default. */ }
    const id = selected === 'system' ? (light ? 'parchment' : 'night-paper') : selected;
    const type = choice('schrift', 'ai-capella-schrift', ['neu', 'bodoni', 'heute', 'test'], 'neu');
    const start = id === 'velvet' ? 'heute' : choice('start', 'ai-capella-start', ['neu', 'heute', 'zeile', 'buehne'], 'neu');
    root.dataset.theme = id;
    root.dataset.themePreference = selected;
    // Compatibility attributes retain selector/event contracts during P1–P5.
    root.dataset.design = id === 'velvet' ? 'samt' : 'papier';
    if (id === 'parchment')
        root.dataset.ground = 'pergament';
    else
        delete root.dataset.ground;
    if (type !== 'bodoni' && type !== 'heute')
        root.dataset.type = 'revival';
    else
        delete root.dataset.type;
    if (start !== 'heute')
        root.dataset.start = 'neu';
    else
        delete root.dataset.start;
    if (start === 'zeile' || start === 'buehne')
        root.dataset.title = start;
    else
        delete root.dataset.title;
    const chrome = getComputedStyle(root).getPropertyValue('--ds-browser-chrome').trim();
    if (chrome) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chrome);
    return { id, preference: selected, revival: type !== 'bodoni' && type !== 'heute', start };
}
