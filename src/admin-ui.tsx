import { useEffect, useState, useRef } from 'react';
import { adminMessages, adminFieldMessages, type Lang } from './i18n';
import { LanguageToggle } from './account-stage';
import { adminInstant } from './admin-time';
import './admin.css';
type Row = Record<string, any>;
async function request(path: string, method = 'GET', body?: unknown) { const r = await fetch('/api/admin/' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); if (r.status === 404) {
    location.replace('/admin');
    throw Error('404');
} if (!r.ok)
    throw Error(String(r.status)); return r.json(); }
export function AdminPage() {
    const [language, setLanguage] = useState<Lang>('en'), [tab, setTab] = useState(locationTab), [filters, setFilters] = useState<Row>({}), [query, setQuery] = useState(() => typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('search') ?? ''), [items, setItems] = useState<Row[]>([]), [next, setNext] = useState<string | null>(null), [zone, setZone] = useState('UTC'), [detail, setDetail] = useState<Row | null>(null), [error, setError] = useState(''), [pending, setPending] = useState<null | {
        path: string;
        method?: string;
        body?: Row;
        kind: string;
    }>(null), [reason, setReason] = useState(''), [content, setContent] = useState(''), [control, setControl] = useState<Row | null>(null), [usage, setUsage] = useState<Row | null>(null), [metrics, setMetrics] = useState<Row | null>(null), [busy, setBusy] = useState(false);
    const generation = useRef(0), d = adminMessages[language];
    useEffect(() => { setLanguage(localStorage.getItem('ai-capella-lang') === 'de' ? 'de' : 'en'); const pop = () => { setTab(locationTab()); setFilters({}); }; addEventListener('popstate', pop); return () => removeEventListener('popstate', pop); }, []);
    const endpoint = tab === 'transcription' ? 'transcription/jobs' : tab;
    async function load(cursor?: string) { const current = ++generation.current; setBusy(true); setError(''); try {
        const params = new URLSearchParams(Object.entries({ ...filters, search: query, ...(cursor ? { cursor } : {}) }).filter(([, v]) => v !== ''));
        const r = await request(endpoint + '?' + params);
        if (current !== generation.current)
            return;
        setItems(old => cursor ? [...old, ...r.items] : r.items);
        setNext(r.nextCursor);
        setZone(r.timeZone);
        if (tab === 'transcription') {
            const now = new Date();
            const range = new URLSearchParams({ from: filters.from || new Date(now.getTime() - 7 * 86400000).toISOString(), to: filters.to || now.toISOString() });
            const [c, u, m] = await Promise.all([request('transcription/control'), request('transcription/usage?' + range), request('transcription/failures?' + range)]);
            if (current === generation.current) {
                setControl(c);
                setUsage(u);
                setMetrics(m);
            }
        }
    }
    catch {
        setError(d.error);
    }
    finally {
        if (current === generation.current)
            setBusy(false);
    } }
    useEffect(() => { setDetail(null); setItems([]); setContent(''); void load(); }, [tab]);
    async function open(row: Row) { if (!['users', 'ensembles', 'pieces'].includes(tab))
        return; setError(''); try {
        setDetail(await request(tab + '/' + encodeURIComponent(row.id)));
        setContent('');
    }
    catch {
        setError(d.error);
    } }
    const label = (key: string) => (adminFieldMessages[language] as Row)[key] ?? (d as Row)[key] ?? key.replaceAll('_', ' ');
    function value(key: string, v: any): any { if (v === null || v === undefined)
        return '—'; if (key === 'transcription_job_id')
        return <a href={'/admin/transcription?search=' + encodeURIComponent(v)}>{v}</a>; if (typeof v === 'boolean')
        return <span className={v ? 'admin-chip granted' : 'admin-chip'}>{key === 'is_lead' && v ? d.lead : v ? d.yes : d.no}</span>; if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v))
        return adminInstant(v, zone, language); return typeof v === 'object' ? JSON.stringify(v) : String(v); }
    function fields(row: Row) { return <dl>{Object.entries(row).map(([k, v]) => <div key={k}><dt>{label(k)}</dt><dd>{value(k, v)}</dd></div>)}</dl>; }
    const columns=[...new Set(['name','title','email',...Object.keys(items[0]??{id:''})])].filter(k=>k in (items[0]??{id:''}));
    const profile = detail?.profile;
    const auditParams = profile ? (tab === 'users' ? { user: profile.id } : tab === 'ensembles' ? { ensemble: profile.id } : { target: profile.id }) : {};
    return <main className="admin-shell"><header><a href="/app" className="admin-wordmark">LightScore</a><LanguageToggle language={language} onChange={setLanguage}/><h1>{d.title}</h1><nav aria-label={d.title}>{(['users', 'ensembles', 'pieces', 'audit', 'transcription'] as const).map(t => <a aria-current={t === tab ? 'page' : undefined} href={'/admin/' + t} key={t} onClick={e => { e.preventDefault(); history.pushState({}, '', '/admin/' + t); setQuery(''); setFilters({}); setTab(t); }}>{d[t]}</a>)}</nav></header>
 {error && <p role="alert">{error}</p>}<form className="admin-filters" onSubmit={e => { e.preventDefault(); void load(); }}><label className="admin-search">{d.search}<input type="search" value={query} onChange={e => setQuery(e.target.value)}/></label>
 {['from', 'to', ...(['pieces', 'transcription'].includes(tab) ? ['ensemble'] : []), ...(tab === 'audit' ? ['actor', 'target', 'action', 'outcome'] : [])].map(k => <label key={k}>{label(k)}<input value={filters[k] ?? ''} placeholder={k === 'from' || k === 'to' ? '2026-11-01T00:00:00+01:00' : ''} onChange={e => setFilters({ ...filters, [k]: e.target.value })}/></label>)}
 {['sort', 'direction', ...(tab === 'users' ? ['verified', 'sysadmin'] : []), ...(tab === 'pieces' ? ['format'] : []), ...(tab === 'transcription' ? ['state'] : []), ...(tab === 'audit' ? ['targetType'] : [])].map(k => <label key={k}>{label(k)}<select value={filters[k] ?? ''} onChange={e => setFilters({ ...filters, [k]: e.target.value })}><option value="">{d.all}</option>{(k === 'sort' ? ['id', 'created', 'name'] : k === 'direction' ? ['asc', 'desc'] : k === 'format' ? ['musicxml', 'score'] : k === 'state' ? ['queued', 'running', 'completed', 'failed', 'cancelled'] : k === 'targetType' ? ['user', 'ensemble', 'piece', 'original', 'transcription', 'membership', 'invitation'] : ['true', 'false']).map(v => <option key={v} value={v}>{v === 'true' ? d.yes : v === 'false' ? d.no : label(v)}</option>)}</select></label>)}<button disabled={busy}>{d.apply}</button></form>
 {tab === 'transcription' && <><section className="admin-ops"><h2>{d.stop}</h2><p role="status">{control?.paused ? d.paused : d.running}</p>{control?.last && fields(control.last)}<label>{d.reason}<input value={reason} onChange={e => setReason(e.target.value)} maxLength={1000}/></label><button role="switch" aria-checked={!!control?.paused} disabled={!control || !reason.trim()} onClick={() => setPending({ path: 'transcription/control', method: 'PUT', body: { paused: !control?.paused }, kind: 'stop' })}>{d.stop}</button></section><h2>{d.usage}</h2><div className="admin-cards">{[['calls', 'calls'], ['pages', 'pages'], ['tokens', 'input_tokens'], ['tokens', 'output_tokens'], ['cost', 'estimated_cost_usd'], ['unknown', 'unpriced_calls']].map(([title, key]) => <article key={key}><h3>{d[title as keyof typeof d]}</h3><strong>{key === 'estimated_cost_usd' && usage?.groups.some((r: Row) => r[key] === null) ? '—' : usage?.groups.reduce((n: number, r: Row) => n + Number(r[key] ?? 0), 0) ?? '—'}</strong></article>)}</div><h3>{d.latency}</h3>{usage?.groups.map((r: Row, i: number) => <p key={i}>{r.day} · {r.model} · {r.ensemble_id}: {r.latency_p50_ms ?? '—'} / {r.latency_p95_ms ?? '—'}</p>)}<h3>{d.failures}</h3>{metrics?.items.map((r: Row) => <p key={r.reason}>{r.reason}: {r.calls}</p>)}</>}
 <div className="admin-table-wrap"><table><thead><tr>{columns.map(k => <th key={k}>{label(k)}</th>)}</tr></thead><tbody>{items.map(row => <tr key={row.id} tabIndex={0} onClick={() => void open(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void open(row);
    } if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        (e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling)?.querySelector('button');
        ((e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement)?.focus();
    } }}>{columns.map(k => <td className={/id|email|hash/.test(k) ? 'mono' : ''} key={k}>{value(k, row[k])}</td>)}</tr>)}</tbody></table></div>{!busy && !items.length && <p>{d.empty}</p>}{next && <button disabled={busy} onClick={() => void load(next)}>{d.more}</button>}
 {profile && <aside className="admin-detail" role="dialog" aria-modal="true" aria-label={profile.name ?? profile.title ?? profile.id} onKeyDown={e => { if (e.key === 'Escape')
            setDetail(null); if (e.key === 'Tab') {
            const nodes = e.currentTarget.querySelectorAll<HTMLElement>('button,input,a,select');
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        } }}><button autoFocus onClick={() => setDetail(null)}>{d.close}</button><h2>{profile.name ?? profile.title}</h2><h3>{d.profile}</h3>{fields(profile)}{Object.entries(detail).filter(([k]) => !['profile', 'timeZone'].includes(k)).map(([key, v]) => <section key={key}><h3>{label(key)}</h3>{Array.isArray(v) ? v.map((row, i) => <div key={i}>{fields(row)}</div>) : fields(v)}</section>)}
 {tab === 'users' && <Section key={'m' + profile.id} title={d.memberships} path={'memberships?user=' + profile.id} render={fields} more={d.more}/>}
 {tab === 'ensembles' && ['memberships', 'invitations', 'pieces', 'jobs'].map(kind => <Section key={kind + profile.id} title={label(kind)} path={(kind === 'jobs' ? 'transcription/jobs' : kind) + '?ensemble=' + profile.id} render={fields} more={d.more}/>)}
 {tab === 'pieces' && <><Section key={'v' + profile.id} title={d.versions} path={'pieces/' + profile.id + '/versions'} render={fields} more={d.more}/><Section key={'o' + profile.id} title={d.originals} path={'pieces/' + profile.id + '/originals'} more={d.more} render={row => <>{fields(row)}<button onClick={() => { setReason(''); setPending({ path: 'pieces/' + profile.id + '/originals/' + row.id + '/download', kind: 'original' }); }}>{d.original}</button></>}/><button onClick={() => { setReason(''); setPending({ path: 'pieces/' + profile.id + '/content', kind: 'content' }); }}>{d.content}</button>{content && <pre className="admin-content">{content}</pre>}</>}
 <Section key={'a' + profile.id} title={d.audit} path={'audit?' + new URLSearchParams(auditParams as Record<string, string>)} render={fields} more={d.more}/></aside>}
 {pending && <div className="admin-confirm" onKeyDown={e=>{if(e.key==='Escape')setPending(null);if(e.key==='Tab'){const nodes=e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input');const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}} role="dialog" aria-modal="true" aria-label={d.confirm}><p>{d.logged}</p><label>{pending.kind === 'stop' ? d.reason : d.optional}<input autoFocus maxLength={1000} value={reason} onChange={e => setReason(e.target.value)}/></label><button disabled={busy || (pending.kind === 'stop' && !reason.trim())} onClick={async () => { setBusy(true); try {
        const r = await request(pending.path, pending.method ?? 'POST', { ...pending.body, reason });
        if (pending.kind === 'content')
            setContent(typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2));
        if (pending.kind === 'original')
            location.assign(r.url);
        setPending(null);
        setReason('');
        if (pending.kind === 'stop')
            await load();
    }
    catch {
        setError(d.error);
    }
    finally {
        setBusy(false);
    } }}>{d.confirm}</button><button onClick={() => setPending(null)}>{d.close}</button></div>}
 </main>;
}
function locationTab() { if (typeof location === 'undefined')
    return 'users'; const t = location.pathname.split('/')[2]; return ['users', 'ensembles', 'pieces', 'audit', 'transcription'].includes(t) ? t : 'users'; }
function Section({ title, path, render, more }: {
    title: string;
    path: string;
    render: (r: Row) => any;
    more: string;
}) { const [rows, setRows] = useState<Row[]>([]), [cursor, setCursor] = useState<string | null>(null), [error, setError] = useState(false); async function load(next?: string) { try {
    const r = await request(path + (next ? (path.includes('?') ? '&' : '?') + 'cursor=' + encodeURIComponent(next) : ''));
    setRows(old => next ? [...old, ...r.items] : r.items);
    setCursor(r.nextCursor);
}
catch {
    setError(true);
} } useEffect(() => { void load(); }, [path]); return <section><h3>{title}</h3>{error && <p role="alert">⚠</p>}{rows.map((r, i) => <div className="admin-section-row" key={r.id ?? i}>{render(r)}</div>)}{cursor && <button onClick={() => void load(cursor)}>{more}</button>}</section>; }
