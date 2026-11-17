(async () => {
    const queue = new Map();
    let id = 0;
    window.requestAnimationFrame = fn => { queue.set(++id, fn); return id; };
    window.cancelAnimationFrame = id => queue.delete(id);
    performance.now = () => 0;
    const modules = await Promise.all(['theme', 'palette', 'pianoRoll', 'staffView', 'overview', 'artwork', 'lantern', 'goldInk', 'lightRibbons', 'lightName', 'titleStage', 'titleStaff', 'paper', 'musicxml', 'exportPdf'].map(n => import('/src/' + n + '.ts')));
    const [theme, palette, roll, staff, overview, art, lantern, gold, ribbons, name, stage, titleStaff, paper, xml, pdf] = modules;
    const generated = count => `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Theme fixture ${count}</work-title></work><part-list>${Array.from({ length: count }, (_, i) => `<score-part id="P${i}"><part-name>Voice ${i + 1}</part-name></score-part>`).join('')}</part-list>${Array.from({ length: count }, (_, i) => `<part id="P${i}">${Array.from({ length: 4 }, (_, m) => `<measure number="${m + 1}">${m === 0 ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><direction-type><dynamics><mf/></dynamics></direction-type></direction><direction><direction-type><words>dolce</words></direction-type></direction>' : ''}${Array.from({ length: 4 }, (_, j) => `<note><pitch><step>${['C', 'D', 'E', 'G'][(i + j + m) % 4]}</step><octave>${i % 3 === 0 ? 3 : 4}</octave></pitch><duration>1</duration><type>quarter</type><lyric><syllabic>single</syllabic><text>${['Light', 'Score', 'sing', 'on'][j]}</text></lyric></note>`).join('')}</measure>`).join('')}</part>`).join('')}</score-partwise>`;
    const fixtures = Object.fromEntries([1, 4, 8, 12].map(n => [n, generated(n)]));
    let dispose = () => { };
    let views;
    const canvas = (h = 600, w = 1200) => { const c = document.createElement('canvas'); c.style.cssText = `display:block;width:${w}px;height:${h}px`; c.width = w; c.height = h; document.body.append(c); return c; };
    const tick = t => { const pending = [...queue.values()]; queue.clear(); for (const fn of pending)
        fn(t); };
    const clear = () => { dispose(); dispose = () => { }; queue.clear(); document.body.replaceChildren(); document.body.style.cssText = 'margin:0;width:1280px;height:800px;overflow:hidden;background:var(--ds-page-background);color:var(--ds-ink)'; };
    window.p2 = { fixtures, modules, tick, async draw(mode, n = 4) {
            clear();
            const score = xml.parseMusicXML(fixtures[n]);
            const color = id => palette.colorForPart(score.parts.findIndex(p => p.id === id), score.parts.length);
            const label = document.createElement('div');
            label.textContent = `${mode} / ${n} voices`;
            label.style.cssText = 'height:32px;font:16px sans-serif';
            document.body.append(label);
            await theme.canvasFontsReady();
            await gold.loadScriptFont();
            await document.fonts.ready;
            paper.initPaper();
            if (mode === 'roll' || mode === 'staff' || mode === 'overview') {
                const c = canvas(mode === 'overview' ? 96 : 700);
                const View = mode === 'roll' ? roll.PianoRoll : mode === 'staff' ? staff.StaffView : overview.OverviewStrip;
                const view = new View(c, score, color);
                view.resize();
                if (view.setMarkedBars)
                    view.setMarkedBars(new Set([2]));
                view.render(...(mode === 'overview' ? [2.5] : [2.5, 2.5]));
                views = { view, mode, score, c };
            }
            else if (mode === 'cover') {
                for (const count of [1, 4, 8, 12]) {
                    const c = canvas(300, 300);
                    c.style.display = 'inline-block';
                    art.drawCover(c.getContext('2d'), 300, 300, art.coverDataFromScore(xml.parseMusicXML(fixtures[count])));
                }
            }
            else if (mode === 'light') {
                const c = canvas(300);
                ribbons.drawLightRibbons(c.getContext('2d'), 1200, 300, 24, { voices: n, x0: 30, x1: 1170, cy: 150, gap: 24, amp: 24 }, Array(n).fill(1), .9, null, 24);
                const ink = canvas(120);
                gold.drawInkMark(ink.getContext('2d'), { kind: 'words', partId: 'P0', beat: 0, text: 'dolce crescendo' }, { x: 50, y: 70, scale: 2 });
                const lamp = canvas(200);
                const ctx = lamp.getContext('2d');
                ctx.fillStyle = paper.NIGHT_PAPER;
                ctx.fillRect(0, 0, 1200, 200);
                const l = new lantern.Lantern();
                l.under(ctx, 1200, 200, 400, g => { score.parts.forEach((p, i) => { g.fillStyle = color(p.id); g.fillRect(100, 20 + i * 12, 1000, 10); }); }, [{ x: 380, y: 70, w: 80, h: 20, color: color('P0') }]);
                l.over(ctx);
            }
            else if (mode === 'stage' || mode === 'title-staff') {
                const parent = document.createElement('div');
                parent.style.cssText = 'position:relative;width:1280px;height:740px';
                document.body.append(parent);
                const host = document.createElement('div');
                host.style.cssText = 'position:absolute;left:220px;top:150px;font-size:96px';
                parent.append(host);
                const c = document.createElement('canvas');
                c.style.cssText = 'position:absolute;inset:0;width:1280px;height:740px';
                parent.append(c);
                const title = name.lightScoreName(host, mode === 'stage' ? 'stage' : 'staff');
                const stop = mode === 'stage' ? stage.animateStage(c, title) : titleStaff.animateStaff(c, title);
                dispose = () => { stop(); title.dispose(); };
                await document.fonts.ready;
                await new Promise(r => setTimeout(r, 150));
                title.push();
                tick(0);
                await Promise.resolve();
                tick(20000);
                tick(20016);
            }
            return { mode, n, theme: document.documentElement.dataset.theme, canvases: document.querySelectorAll('canvas').length };
        }, async pdf(n = 4) { const score = xml.parseMusicXML(fixtures[n]); const blob = await pdf.makePdf({ xml: fixtures[n], title: score.title, semitones: 0, voices: score.parts.map(p => ({ ...p, include: true })) }); const data = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); }); window.p2.pdfData = data.split(',')[1]; return { bytes: blob.size, length: window.p2.pdfData.length }; }, repaint() { if (views) {
            const { view, mode } = views;
            view.render(...(mode === 'overview' ? [2.5] : [2.5, 2.5]));
        } } };
    return { ready: true };
})();
