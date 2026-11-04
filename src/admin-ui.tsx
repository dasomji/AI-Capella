import { useEffect, useState, useRef } from 'react';
import { adminMessages, adminFieldMessages, adminPolishMessages, type Lang } from './i18n';
import { LanguageToggle } from './account-stage';
import { adminInstant, calendarInstant, calendarRange } from './admin-time';
import './admin.css';
type Row = Record<string, any>;
class AdminRequestError extends Error {constructor(public status:number,message:string){super(message);}}
async function request(path:string,method='GET',body?:unknown){const r=await fetch('/api/admin/'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new AdminRequestError(r.status,data.message??String(r.status));return data;}
export function AdminPage() {
    const [language, setLanguage] = useState<Lang>('en'), [tab, setTab] = useState(locationTab), [filters, setFilters] = useState<Row>({}), [query, setQuery] = useState(() => typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('search') ?? ''), [items, setItems] = useState<Row[]>([]), [next, setNext] = useState<string | null>(null), [zone, setZone] = useState('UTC'), [detail, setDetail] = useState<Row | null>(null), [error, setError] = useState(''), [pending, setPending] = useState<null | {
        path: string;
        method?: string;
        body?: Row;
        kind: string;
    }>(null), [reason, setReason] = useState(''), [content, setContent] = useState(''), [control, setControl] = useState<Row | null>(null), [usage, setUsage] = useState<Row | null>(null), [metrics, setMetrics] = useState<Row | null>(null), [busy, setBusy] = useState(false);
    const generation = useRef(0), d = adminMessages[language];
    const msg=(key:string)=>(adminPolishMessages[language] as Row)[key]??key;
    const errorText=(e:unknown)=>e instanceof AdminRequestError?(e.status===404?msg('Not found'):e.status===429?e.message:d.error):d.error;
    const number=(v:number)=>new Intl.NumberFormat(language,{maximumFractionDigits:6}).format(v);
    useEffect(() => { setLanguage(localStorage.getItem('ai-capella-lang') === 'de' ? 'de' : 'en'); const pop = () => { setTab(locationTab()); setFilters({}); }; addEventListener('popstate', pop); return () => removeEventListener('popstate', pop); }, []);
    const endpoint = tab === 'transcription' ? 'transcription/jobs' : tab;
    async function load(cursor?: string) { const current = ++generation.current; setBusy(true); setError(''); try {
        const dateFilters={...filters};for(const k of ['from','to'])if(dateFilters[k])dateFilters[k]=calendarInstant(dateFilters[k],zone);
        const params = new URLSearchParams(Object.entries({ ...dateFilters, search: tab==='transcription'?'':query, ...(cursor ? { cursor } : {}) }).filter(([, v]) => v !== ''));
        const r = await request(endpoint + '?' + params);
        if (current !== generation.current)
            return;
        setItems(old => cursor ? [...old, ...r.items] : r.items);
        setNext(r.nextCursor);
        setZone(r.timeZone);if(tab==='transcription'&&!filters.from&&!filters.to&&!filters.all){setFilters(calendarRange(r.timeZone));return;}
        if (tab === 'transcription') {
            const defaults=calendarRange(r.timeZone);
            const range = new URLSearchParams({from:dateFilters.from||calendarInstant(defaults.from,r.timeZone),to:dateFilters.to||calendarInstant(defaults.to,r.timeZone),...(filters.ensemble?{ensemble:filters.ensemble}:{}),...(filters.all?{all:'true',from:'1970-01-01T00:00:00Z'}:{})});
            const [c, u, m] = await Promise.all([request('transcription/control'), request('transcription/usage?' + range), request('transcription/failures?' + range)]);
            if (current === generation.current) {
                setControl(c);
                setUsage(u);
                setMetrics(m);
            }
        }
    }
    catch(e) {
        setError(errorText(e));
    }
    finally {
        if (current === generation.current)
            setBusy(false);
    } }
    useEffect(() => { setDetail(null); setItems([]); setContent(''); }, [tab]);
    useEffect(()=>{const timer=setTimeout(()=>void load(),300);return ()=>{clearTimeout(timer);generation.current++;};},[tab,query,filters,zone]);
    async function open(row: Row) { if (!['users', 'ensembles', 'pieces'].includes(tab))
        return; setError(''); try {
        setDetail(await request(tab + '/' + encodeURIComponent(row.id)));
        setContent('');
    }
    catch(e) {
        setDetail({profile:{id:row.id,title:row.name??row.title??row.id},error:errorText(e)});
    } }
    const label = (key: string) => (adminPolishMessages[language] as Row)[key] ?? (adminFieldMessages[language] as Row)[key] ?? (d as Row)[key] ?? key.replaceAll('_', ' ');
    function value(key: string, v: any): any { if (v === null || v === undefined)
        return '—'; if (key === 'transcription_job_id')
        return <a href={'/admin/transcription?search=' + encodeURIComponent(v)}>{v}</a>; if (typeof v === 'boolean')
        return <span className={['is_lead','manage_members','edit_music_pieces','ai_transcription'].includes(key)?(v?'admin-chip granted':'admin-chip'):(v?'admin-yes':'admin-no')}>{key === 'is_lead' && v ? d.lead : v ? d.yes : d.no}</span>; if (typeof v === 'string' && (key.endsWith('_at') || ['last_active','last_sign_in'].includes(key)))
        return <time dateTime={v} title={new Date(v).toISOString()}>{adminInstant(v, zone, language)}</time>; if(typeof v==='number')return number(v);if(typeof v==='string'&&(/(^id$|_id$|hash|sha256)/.test(key)))return <span className="admin-id"><span title={v}>{v.slice(0,12)}{v.length>12?'…':''}</span><button type="button" aria-label={msg('Copy')+' '+label(key)} onClick={e=>{e.stopPropagation();void navigator.clipboard.writeText(v);}}>⧉</button></span>; return typeof v === 'object' ? JSON.stringify(v) : String(v); }
    function fields(row: Row) { return <dl>{Object.entries(row).map(([k, v]) => <div key={k}><dt>{label(k)}</dt><dd>{value(k, v)}</dd></div>)}</dl>; }
    const columns=[...new Set(['name','title','email',...Object.keys(items[0]??{id:''})])].filter(k=>k in (items[0]??{id:''}));
    const profile = detail?.profile;
    const auditParams:Record<string,string> = profile ? (tab === 'users' ? { user: profile.id } : tab === 'ensembles' ? { ensemble: profile.id } : { target: profile.id }) : {};
    return <main className="admin-shell"><header><a href="/app" className="admin-wordmark">LightScore</a><LanguageToggle language={language} onChange={setLanguage}/><h1>{d.title}</h1><nav aria-label={d.title}>{(['users', 'ensembles', 'pieces', 'audit', 'transcription'] as const).map(t => <a aria-current={t === tab ? 'page' : undefined} href={'/admin/' + t} key={t} onClick={e => { e.preventDefault(); history.pushState({}, '', '/admin/' + t); setQuery(''); setFilters({}); setTab(t); }}>{d[t]}</a>)}</nav></header>
 {error && <p role="alert">{error}</p>}<form className="admin-filters" onSubmit={e=>e.preventDefault()}>
 {tab!=='transcription'&&<label className="admin-search">{d.search}<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
 {['from','to'].map(k=><label key={k}>{k==='from'?msg('From'):msg('Until (exclusive)')}<input type="date" value={filters[k]??''} onChange={e=>setFilters({...filters,[k]:e.target.value,all:''})}/></label>)}
 <div className="admin-presets">{[7,30,90,0].map((days,i)=><span key={days}>{i>0&&' · '}<button type="button" onClick={()=>setFilters({...filters,...(days?calendarRange(zone,days):{from:'',to:'',all:'true'})})}>{days?`${days} ${msg('days')}`:d.all}</button></span>)}<small>{msg('Time zone')}: {zone}</small></div>
 {[...(['pieces','transcription'].includes(tab)?['ensemble']:[]),...(tab==='audit'?['actor','target','action','outcome']:[])].map(k=><label key={k}>{label(k)}<input value={filters[k]??''} onChange={e=>setFilters({...filters,[k]:e.target.value})}/></label>)}
 {tab!=='transcription'&&['sort','direction',...(tab==='users'?['verified','sysadmin']:[]),...(tab==='pieces'?['format']:[]),...(tab==='audit'?['targetType']:[])].map(k=><fieldset key={k}><legend>{label(k)}</legend>{[...(['sort','direction'].includes(k)?[]:['']),...(k==='sort'?['id','created',...(tab==='pieces'?['updated']:[]),'name']:k==='direction'?['asc','desc']:k==='format'?['musicxml','score']:k==='targetType'?['user','ensemble','piece','original','transcription','membership','invitation']:['true','false'])].map((v,i)=><span key={v}>{i>0&&' · '}<button type="button" aria-pressed={(filters[k]??(k==='sort'?'id':k==='direction'?'asc':''))===v} onClick={()=>setFilters({...filters,[k]:v})}>{v===''?d.all:v==='true'?d.yes:v==='false'?d.no:label(v)}</button></span>)}</fieldset>)}
 </form>
 {tab === 'transcription' && <><section className="admin-ops"><h2>{d.stop}</h2><p role="status">{control?.paused ? msg('Paused since ')+(control.last?adminInstant(control.last.created_at,zone,language)+' '+msg('by ')+(control.last.actor_name??'—'):'—') : msg('Processing enabled')}</p>{control?.last && fields(control.last)}<label>{d.reason}<input value={reason} onChange={e => setReason(e.target.value)} maxLength={1000}/></label><button className="switch" title={d.stop} role="switch" aria-label={d.stop} aria-checked={!control?.paused} disabled={!control || !reason.trim()} onClick={() => setPending({ path: 'transcription/control', method: 'PUT', body: { paused: !control?.paused }, kind: 'stop' })}/></section><h2>{d.usage}</h2><div className="admin-cards">{[['calls', 'calls'], ['pages', 'pages'], ['inputTokens', 'input_tokens'], ['outputTokens', 'output_tokens'], ['cost', 'estimated_cost_usd'], ['unknown', 'unpriced_calls']].map(([title, key]) => <article key={key}><h3>{title==='inputTokens'?msg('Input tokens'):title==='outputTokens'?msg('Output tokens'):title==='cost'?msg('Estimated cost (USD)'):title==='unknown'?msg('Unpriced (count)'):d[title as keyof typeof d]}</h3><strong>{key === 'estimated_cost_usd' && usage?.groups.some((r: Row) => r[key] === null) ? '—' : usage?number(usage.groups.reduce((n: number, r: Row) => n + Number(r[key] ?? 0), 0)):'—'}</strong></article>)}</div><h3>{d.latency}</h3>{!usage?.groups.length&&<p>— / —</p>}{usage?.groups.map((r: Row, i: number) => <p key={i}>{r.day} · {r.model} · {r.ensemble_id}: {r.latency_p50_ms===null?'—':number(r.latency_p50_ms)} / {r.latency_p95_ms===null?'—':number(r.latency_p95_ms)}</p>)}<h3>{d.failures}</h3><table><thead><tr><th>{d.reason}</th><th>{d.calls}</th></tr></thead><tbody>{metrics?.items.map((r:Row)=><tr key={r.reason}><td>{label(r.reason)}</td><td>{number(r.calls)}</td></tr>)}</tbody></table></>}
 <div className="admin-table-wrap"><table><thead><tr>{columns.map(k => <th key={k}>{label(k)}</th>)}</tr></thead><tbody>{items.map(row => <tr key={row.id} tabIndex={0} onClick={() => void open(row)} onKeyDown={e => { if(e.target!==e.currentTarget)return; if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void open(row);
    } if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        (e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling)?.querySelector('button');
        ((e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement)?.focus();
    } }}>{columns.map(k => <td data-label={label(k)} className={/id|email|hash/.test(k) ? 'mono' : ''} key={k}>{value(k, row[k])}</td>)}</tr>)}</tbody></table></div>{!busy && !items.length && <p>{d.empty}</p>}{next && <button disabled={busy} onClick={() => void load(next)}>{d.more}</button>}
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
        } }}><button className="admin-close" aria-label={d.close} autoFocus onClick={() => setDetail(null)}>×</button><h2>{profile.name ?? profile.title}</h2><h3>{d.profile}</h3>{detail?.error?<p role="alert">{detail.error}</p>:fields(profile)}{Object.entries(detail).filter(([k]) => !['profile', 'timeZone','sections','error'].includes(k)).map(([key, v]) => <section key={key}><h3>{label(key)}</h3>{Array.isArray(v) ? v.map((row, i) => <div key={i}>{fields(row)}</div>) : fields(v)}</section>)}
 {tab === 'users' && <Section errorText={errorText} initial={detail?.sections?.memberships} key={'m' + profile.id} title={d.memberships} path={'memberships?user=' + profile.id} render={fields} more={d.more}/>}
 {tab === 'ensembles' && ['memberships', 'invitations', 'pieces', 'jobs'].map(kind => <Section errorText={errorText} initial={detail?.sections?.[kind]} key={kind + profile.id} title={label(kind)} path={(kind === 'jobs' ? 'transcription/jobs' : kind) + '?ensemble=' + profile.id} render={fields} more={d.more}/>)}
 {tab === 'pieces' && <><Section errorText={errorText} initial={detail?.sections?.versions} key={'v' + profile.id} title={d.versions} path={'pieces/' + profile.id + '/versions'} render={fields} more={d.more}/><Section errorText={errorText} initial={detail?.sections?.originals} key={'o' + profile.id} title={d.originals} path={'pieces/' + profile.id + '/originals'} more={d.more} render={row => <>{fields(row)}<button onClick={() => { setReason(''); setPending({ path: 'pieces/' + profile.id + '/originals/' + row.id + '/download', kind: 'original' }); }}>{d.original}</button></>}/><button onClick={() => { setReason(''); setPending({ path: 'pieces/' + profile.id + '/content', kind: 'content' }); }}>{d.content}</button>{content && <pre className="admin-content">{content}</pre>}</>}
 <Section errorText={errorText} initial={detail?.sections?.audit} key={'a' + profile.id} title={d.audit} path={'audit?' + new URLSearchParams({...auditParams,sort:'created',direction:'desc'})} render={fields} more={d.more}/></aside>}
 {pending && <div className="admin-confirm" onKeyDown={e=>{if(e.key==='Escape')setPending(null);if(e.key==='Tab'){const nodes=e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input');const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}} role="dialog" aria-modal="true" aria-label={d.confirm}><p>{d.logged}</p><label>{d.reason}<input autoFocus maxLength={1000} value={reason} onChange={e => setReason(e.target.value)}/></label><button className={pending.body?.paused?'admin-danger':''} disabled={busy || !reason.trim()} onClick={async () => { setBusy(true); try {
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
    catch(e) {
        setError(errorText(e));
    }
    finally {
        setBusy(false);
    } }}>{d.confirm}</button><button onClick={() => setPending(null)}>{d.close}</button></div>}
 </main>;
}
function locationTab() { if (typeof location === 'undefined')
    return 'users'; const t = location.pathname.split('/')[2]; return ['users', 'ensembles', 'pieces', 'audit', 'transcription'].includes(t) ? t : 'users'; }
function Section({ title, path, render, more, initial, errorText }: {
    errorText:(e:unknown)=>string;
    initial?:Row;
    title: string;
    path: string;
    render: (r: Row) => any;
    more: string;
}) { const [rows, setRows] = useState<Row[]>(initial?.items??[]), [cursor, setCursor] = useState<string | null>(initial?.nextCursor??null), [error, setError] = useState(''); async function load(next?: string) { try {
    const r = await request(path + (next ? (path.includes('?') ? '&' : '?') + 'cursor=' + encodeURIComponent(next) : ''));
    setRows(old => next ? [...old, ...r.items] : r.items);
    setCursor(r.nextCursor);
}
catch(e) {
    setError(errorText(e));
} } useEffect(() => { if(!initial)void load(); }, [path]); return <section><h3>{title}</h3>{error && <p role="alert">{error}</p>}{rows.map((r, i) => <div className="admin-section-row" key={r.id ?? i}>{render(r)}</div>)}{cursor && <button onClick={() => void load(cursor)}>{more}</button>}</section>; }
