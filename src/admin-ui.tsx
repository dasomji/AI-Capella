import { Button, IconButton, Field, Input, Switch, Badge, Card, ToggleGroup, NavigationTabs, Table, TableWrap, TableHeader, TableCell, TableRow, Drawer, ConfirmDialog, EmptyState, Loading, Status, Workspace, toast } from "./design-system/react";
import { AdminDataTable, type AdminColumn } from './admin-data-table';
import { AdminMembershipManagement } from './admin-management';
import { adminManagementMessages } from './i18n';
import { useEffect, useState, useRef, useMemo } from 'react';
import { adminRateMessage, adminMessages, adminFieldMessages, adminPolishMessages, type Lang } from './i18n';
import { adminInstant, calendarInstant, calendarRange } from './admin-time';
type Row = Record<string, any>;
class AdminRequestError extends Error {constructor(public status:number,message:string){super(message);}}
async function request(path:string,method='GET',body?:unknown){const r=await fetch('/api/admin/'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new AdminRequestError(r.status,data.max&&data.unit?adminRateMessage(data.max,data.unit,localStorage.getItem('ai-capella-lang')==='de'?'de':'en'):data.message??String(r.status));return data;}
export function AdminPage() {
    const [language, setLanguage] = useState<Lang>('en'), [tab, setTab] = useState(locationTab), [filters, setFilters] = useState<Row>({}), [query, setQuery] = useState(() => typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('search') ?? ''), [items, setItems] = useState<Row[]>([]), [next, setNext] = useState<string | null>(null), [zone, setZone] = useState('UTC'), [detail, setDetail] = useState<Row | null>(null), [error, setError] = useState(''), [pending, setPending] = useState<null | {
        path: string;
        method?: string;
        body?: Row;
        kind: string;
    }>(null), [reason, setReason] = useState(''), [content, setContent] = useState(''), [control, setControl] = useState<Row | null>(null), [usage, setUsage] = useState<Row | null>(null), [metrics, setMetrics] = useState<Row | null>(null), [busy, setBusy] = useState(false), [revision,setRevision]=useState(0);
    const detailOpener = useRef<HTMLElement | null>(null), confirmOpener = useRef<HTMLElement | null>(null);
    const generation = useRef(0), detailGeneration = useRef(0), d = adminMessages[language];
    const msg=(key:string)=>(adminPolishMessages[language] as Row)[key]??key;
    const errorText=(e:unknown)=>e instanceof AdminRequestError?(e.status===404?msg('Not found'):e.status===429?e.message:d.error):d.error;
    const number=(v:number)=>new Intl.NumberFormat(language,{maximumFractionDigits:6}).format(v);
    useEffect(() => { setLanguage(localStorage.getItem('ai-capella-lang') === 'de' ? 'de' : 'en'); const pop = () => { setTab(locationTab()); setFilters({}); }; addEventListener('popstate', pop); return () => removeEventListener('popstate', pop); }, []);
    const endpoint = tab === 'transcription' ? 'transcription/jobs' : tab;
    async function load(cursor?: string) { if(['users','ensembles'].includes(tab))return; const current = ++generation.current; setBusy(true); setError(''); try {
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
    function closeDetail() { detailGeneration.current++; setDetail(null); }
    useEffect(() => { closeDetail(); setItems([]); setContent(''); }, [tab]);
    useEffect(()=>{const timer=setTimeout(()=>void load(),300);return ()=>{clearTimeout(timer);generation.current++;};},[tab,query,filters,zone]);
    async function open(row: Row, opener?: HTMLElement) { if (!['users', 'ensembles', 'pieces'].includes(tab))
        return; detailOpener.current = opener ?? document.activeElement as HTMLElement; const current = ++detailGeneration.current; setError(''); try {
        const result = await request(tab + '/' + encodeURIComponent(row.id));
        if (current !== detailGeneration.current) return;
        setDetail(result);
        setContent('');
    }
    catch(e) {
        if (current === detailGeneration.current) setDetail({profile:{id:row.id,title:row.name??row.title??row.id},error:errorText(e)});
    } }
    const label = (key: string) => (adminManagementMessages[language] as Row)[key] ?? (adminPolishMessages[language] as Row)[key] ?? (adminFieldMessages[language] as Row)[key] ?? (d as Row)[key] ?? key.replaceAll('_', ' ');
    const copyIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/></svg>;
    function copy(text:string) { void navigator.clipboard.writeText(text).catch(()=>toast(d.error,'error')); }
    function value(key: string, v: any): any {
        if(v===null||v===undefined)return '—';
        if(['state','outcome','failure_reason','error_kind','kind','format'].includes(key)&&typeof v==='string')return label(v);
        if(key==='transcription_job_id')return <a href={'/admin/transcription?search='+encodeURIComponent(v)}>{v}</a>;
        if(typeof v==='boolean')return ['is_lead','manage_members','edit_music_pieces','ai_transcription'].includes(key)?<Badge variant="admin" intent={v?'accent':'neutral'}>{key==='is_lead'&&v?d.lead:v?d.yes:d.no}</Badge>:<Workspace as="span" part={v?"ink":"secondary"}>{v?d.yes:d.no}</Workspace>;
        if(typeof v==='string'&&(key.endsWith('_at')||['last_active','last_sign_in'].includes(key)))return <time dateTime={v} title={new Date(v).toISOString()}>{adminInstant(v,zone,language)}</time>;
        if(typeof v==='number')return number(v);
        if(typeof v==='string'&&/(^id$|_id$|hash|sha256)/.test(key))return <Workspace as="span" part="identifier"><span title={v}>{v.slice(0,12)}{v.length>12?'…':''}</span><IconButton variant="admin-copy" label={msg('Copy')+' '+label(key)} onClick={event=>{event.stopPropagation();copy(v);}}>{copyIcon}</IconButton></Workspace>;
        return typeof v==='object'?JSON.stringify(v):String(v);
    }
    function actor(name:string|undefined,id:string|undefined){return <Workspace as="span" part="identifier">{name??'—'}{id&&<IconButton variant="admin-copy" title={id} label={msg('Copy')+' '+label('actor_id')} onClick={event=>{event.stopPropagation();copy(id);}}>{copyIcon}</IconButton>}</Workspace>;}
    function fields(row:Row){return <Workspace as="dl" part="definitions">{Object.entries(row).filter(([key])=>key!=='actor_name').map(([key,v])=><Workspace part="definition" key={key}><Workspace as="dt" part="term">{label(key)}</Workspace><Workspace as="dd" part="value">{key==='actor_id'?actor(row.actor_name,v):value(key,v)}</Workspace></Workspace>)}</Workspace>;}
    function queue(change:NonNullable<typeof pending>, opener:HTMLElement){confirmOpener.current=opener;setPending(change);}
    const managementColumns = useMemo<AdminColumn[]>(()=>(tab==='users'?['name','email','email_verified','sysadmin','ensemble_count','created_at','last_active','id']:['name','kind','members','pieces','created_at','id']).map(k=>({id:k,label:label(k),sort:k==='id'?'id':k==='name'?'name':k==='email'?'email':k==='created_at'?'created':undefined,cell:row=>value(k,row[k])})) as AdminColumn[], [tab, language, zone]);
    const columns=[...new Set(['name','title','email',...Object.keys(items[0]??{id:''})])].filter(k=>k in (items[0]??{id:''}) && k!=='actor_name');
    const profile = detail?.profile;
    const auditParams:Record<string,string> = profile ? (tab === 'users' ? { user: profile.id } : tab === 'ensembles' ? { ensemble: profile.id } : { target: profile.id }) : {};
    return <Workspace as="main" part="page" data-admin="shell">
      <Workspace as="header" part="header">
        <Workspace as="a" href="/app" part="wordmark">LightScore</Workspace>
        <Workspace part="language"><ToggleGroup variant="admin-language" label="Language / Sprache" separator=" · " items={[{value:"de",label:"DE"},{value:"en",label:"EN"}]} value={language} onChange={value=>{const next=value as Lang;localStorage.setItem("ai-capella-lang",next);document.documentElement.lang=next;setLanguage(next);}}/></Workspace>
        <Workspace as="h1" part="title">{d.title}</Workspace>
        <NavigationTabs variant="admin" label={d.title} value={tab} items={(['users','ensembles','pieces','audit','transcription'] as const).map(t=>({value:t,label:d[t],href:'/admin/'+t}))} onNavigate={t=>{history.pushState({},'', '/admin/'+t);setQuery('');setFilters({});setTab(t);}}/>
      </Workspace>
      {error&&<Status variant="admin" role="alert">{error}</Status>}
      <form onSubmit={event=>event.preventDefault()}><Workspace part="filters" data-admin="filters">
        {tab!=='transcription'&&<Workspace part="search"><Field variant="admin" label={d.search}>{association=><Input {...association} type="search" value={query} onChange={event=>setQuery(event.target.value)}/>}</Field></Workspace>}
        {['from','to'].map(k=><Workspace part="filter" key={k}><Field variant="admin" label={k==='from'?msg('From'):msg('Until (exclusive)')}>{association=><Input {...association} type="date" value={filters[k]??''} onChange={event=>setFilters({...filters,[k]:event.target.value,all:''})}/>}</Field></Workspace>)}
        <Workspace part="presets"><ToggleGroup variant="presets" separator=" · " label={msg('days')} value="" items={[7,30,90,0].map(days=>({value:String(days),label:days?`${days} ${msg('days')}`:d.all}))} onChange={value=>{const days=Number(value);setFilters({...filters,...(days?calendarRange(zone,days):{from:'',to:'',all:'true'})});}}/><Workspace as="small" part="note">{msg('Time zone')}: {zone}</Workspace></Workspace>
        {[...(['pieces','transcription'].includes(tab)?['ensemble']:[]),...(tab==='audit'?['actor','target','action','outcome']:[])].map(k=><Workspace part="filter" key={k}><Field variant="admin" label={label(k)}>{association=><Input {...association} value={filters[k]??''} onChange={event=>setFilters({...filters,[k]:event.target.value})}/>}</Field></Workspace>)}
        {tab!=='transcription'&&[...(!['users','ensembles'].includes(tab)?['sort','direction']:[]),...(tab==='users'?['verified','sysadmin']:[]),...(tab==='pieces'?['format']:[]),...(tab==='audit'?['targetType']:[])].map(k=><Workspace as="fieldset" part="fieldset" key={k}><Workspace as="legend" part="legend">{label(k)}</Workspace><ToggleGroup variant="admin" separator=" · " label={label(k)} value={filters[k]??(k==='sort'?'id':k==='direction'?'asc':'')} items={[...(['sort','direction'].includes(k)?[]:['']),...(k==='sort'?['id','created',...(tab==='pieces'?['updated']:[]),'name']:k==='direction'?['asc','desc']:k==='format'?['musicxml','score']:k==='targetType'?['user','ensemble','piece','original','transcription','membership','invitation']:['true','false'])].map(v=>({value:v,label:v===''?d.all:v==='true'?d.yes:v==='false'?d.no:label(v)}))} onChange={v=>setFilters({...filters,[k]:v})}/></Workspace>)}
      </Workspace></form>
      {tab==='transcription'&&<>
        <Card as="section" variant="admin" data-admin="ops"><Workspace as="h2" part="heading">{d.stop}</Workspace><Status variant="admin">{control?.paused?msg('Paused since ')+(control.last?adminInstant(control.last.created_at,zone,language)+' '+msg('by ')+(control.last.actor_name??'—'):'—'):msg('Processing enabled')}</Status>
          {control?.last&&<div><Workspace as="p" part="paragraph">{msg('Last reason')}: {control.last.reason??'—'}</Workspace>{actor(control.last.actor_name,control.last.actor_id)}</div>}
          <Workspace part="subheading"><Field variant="admin" label={msg('New reason')}>{association=><Input {...association} value={reason} onChange={event=>setReason(event.target.value)} maxLength={1000}/>}</Field></Workspace>
          <span>{msg('Processing stopped')}</span><Switch variant="admin" label={msg('Processing stopped')} title={d.stop} checked={!!control?.paused} disabled={!control||!reason.trim()} onClick={event=>queue({path:'transcription/control',method:'PUT',body:{paused:!control?.paused},kind:'stop'},event.currentTarget)}/>
        </Card>
        <Workspace as="h2" part="heading">{d.usage}</Workspace><Workspace part="metrics">{[['calls','calls'],['pages','pages'],['inputTokens','input_tokens'],['outputTokens','output_tokens'],['cost','estimated_cost_usd'],['unknown','unpriced_calls']].map(([title,key])=><Card variant="admin" key={key}><Workspace as="h3" part="subheading">{title==='inputTokens'?msg('Input tokens'):title==='outputTokens'?msg('Output tokens'):title==='cost'?msg('Estimated cost (USD)'):title==='unknown'?msg('Unpriced (count)'):d[title as keyof typeof d]}</Workspace><Workspace as="strong" part="metric-value">{key==='estimated_cost_usd'&&usage?.groups.some((r:Row)=>r[key]===null)?'—':usage?number(usage.groups.reduce((n:number,r:Row)=>n+Number(r[key]??0),0)):'—'}</Workspace></Card>)}</Workspace>
        <Workspace as="h3" part="subheading">{d.latency}</Workspace><Table variant="metrics"><thead><TableRow><TableHeader>{msg('Day')}</TableHeader><TableHeader>{msg('Model')}</TableHeader><TableHeader>p50 (ms)</TableHeader><TableHeader>p95 (ms)</TableHeader></TableRow></thead><tbody>{usage?.groups.map((r:Row,i:number)=><TableRow key={i}><TableCell>{r.day}</TableCell><TableCell>{r.model}</TableCell><TableCell>{r.latency_p50_ms==null?'—':number(r.latency_p50_ms)}</TableCell><TableCell>{r.latency_p95_ms==null?'—':number(r.latency_p95_ms)}</TableCell></TableRow>)}</tbody></Table>
        <Workspace as="h3" part="subheading">{d.failures}</Workspace><Table variant="metrics"><thead><TableRow><TableHeader>{d.reason}</TableHeader><TableHeader>{d.calls}</TableHeader></TableRow></thead><tbody>{metrics?.items.map((r:Row)=><TableRow key={r.reason}><TableCell>{label(r.reason)}</TableCell><TableCell>{number(r.calls)}</TableCell></TableRow>)}</tbody></Table>
      </>}
      {['users','ensembles'].includes(tab)?<AdminDataTable key={tab} path={tab} caption={label(tab)} language={language} search={query} filters={Object.fromEntries(Object.entries(filters).filter(([,v])=>v).map(([k,v])=>[k,['from','to'].includes(k)?calendarInstant(v,zone):v]))} revision={revision} onZone={setZone} onOpen={(row,opener)=>void open(row,opener)} columns={managementColumns}/>:<>
        <TableWrap variant="records" data-admin="table-wrap"><Table><thead><TableRow>{columns.map(k=><TableHeader key={k}>{label(k)}</TableHeader>)}</TableRow></thead><tbody>{items.map(row=><TableRow key={row.id} tabIndex={0} onClick={event=>void open(row,event.currentTarget)} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();void open(row,event.currentTarget);}if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();((event.key==='ArrowDown'?event.currentTarget.nextElementSibling:event.currentTarget.previousElementSibling) as HTMLElement)?.focus();}}}>{columns.map(k=><TableCell data-label={label(k)} mono={/id|email|hash/.test(k)} key={k}>{k==='actor_id'?actor(row.actor_name,row[k]):value(k,row[k])}</TableCell>)}</TableRow>)}</tbody></Table></TableWrap>
        {busy&&<Loading layout="tw:sr-only">{adminManagementMessages[language].loading}</Loading>}{!busy&&!items.length&&<EmptyState variant="admin-text" title={d.empty}/>} {next&&<Button variant="dense" busy={busy} onClick={()=>void load(next)}>{d.more}</Button>}
      </>}
      {profile&&<Drawer open title={profile.name??profile.title??profile.id} data-admin="detail" behavior={{opener:detailOpener.current,outside:'ignore'}} onCancel={closeDetail}>
        <IconButton variant="admin-close" label={d.close} layout={['tw:absolute',"tw:right-content","tw:top-control"]} autoFocus onClick={closeDetail}>×</IconButton>
        <Workspace as="h3" part="subheading">{d.profile}</Workspace>{detail?.error?<Status variant="admin" role="alert">{detail.error}</Status>:fields(profile)}
        {Object.entries(detail).filter(([k])=>!['profile','timeZone','sections','error'].includes(k)).map(([key,v])=><section key={key}><Workspace as="h3" part="subheading">{label(key)}</Workspace>{Array.isArray(v)?v.map((row,i)=><div key={i}>{fields(row)}</div>):fields(v)}</section>)}
        {['users','ensembles'].includes(tab)&&!detail?.error&&<AdminMembershipManagement key={tab+profile.id} entity={tab as 'users'|'ensembles'} profile={profile} sysadmin={!!detail.roles?.some((r:Row)=>r.role==='sysadmin')} language={language} onChanged={async()=>{setRevision(v=>v+1);const current=++detailGeneration.current;const result=await request(tab+'/'+encodeURIComponent(profile.id));if(current===detailGeneration.current)setDetail(result);}}/>}
        {tab==='ensembles'&&['invitations','pieces','jobs'].map(kind=><Section errorText={errorText} initial={detail?.sections?.[kind]} key={kind+profile.id+revision} title={label(kind)} path={(kind==='jobs'?'transcription/jobs':kind)+'?ensemble='+profile.id} render={fields} more={d.more}/>)}
        {tab==='pieces'&&<><Section errorText={errorText} initial={detail?.sections?.versions} key={'v'+profile.id} title={d.versions} path={'pieces/'+profile.id+'/versions'} render={fields} more={d.more}/><Section errorText={errorText} initial={detail?.sections?.originals} key={'o'+profile.id} title={d.originals} path={'pieces/'+profile.id+'/originals'} more={d.more} render={row=><>{fields(row)}<Button variant="dense" onClick={event=>{setReason('');queue({path:'pieces/'+profile.id+'/originals/'+row.id+'/download',kind:'original'},event.currentTarget);}}>{d.original}</Button></>}/><Button variant="dense" onClick={event=>{setReason('');queue({path:'pieces/'+profile.id+'/content',kind:'content'},event.currentTarget);}}>{d.content}</Button>{content&&<Workspace as="pre" part="content" data-admin="content">{content}</Workspace>}</>}
        <Section errorText={errorText} initial={detail?.sections?.audit} key={'a'+profile.id} title={d.audit} path={'audit?'+new URLSearchParams({...auditParams,sort:'created',direction:'desc'})} render={fields} more={d.more}/>
      </Drawer>}
      {pending&&<ConfirmDialog open variant="admin-reason" title={d.confirm} data-admin="confirm" behavior={{opener:confirmOpener.current,busy,busyCancel:'block',outside:'ignore'}} onCancel={()=>setPending(null)}>
        <Workspace as="p" part="paragraph">{d.logged}</Workspace><Field variant="admin" label={d.reason} layout="tw:mb-group">{association=><Input {...association} autoFocus maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)}/>}</Field>
        <Button variant="dense" intent={pending.body?.paused?'danger':'secondary'} layout="tw:m-compact" busy={busy} disabled={!reason.trim()} onClick={async()=>{setBusy(true);try{const r=await request(pending.path,pending.method??'POST',{...pending.body,reason});if(pending.kind==='content')setContent(typeof r.body==='string'?r.body:JSON.stringify(r.body,null,2));if(pending.kind==='original')location.assign(r.url);setPending(null);setReason('');if(pending.kind==='stop')await load();}catch(e){setError(errorText(e));}finally{setBusy(false);}}}>{d.confirm}</Button><Button variant="dense" layout="tw:m-compact" disabled={busy} onClick={()=>setPending(null)}>{d.close}</Button>
      </ConfirmDialog>}
    </Workspace>;
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
} } useEffect(() => { if(!initial)void load(); }, [path]); return <section><Workspace as="h3" part="subheading">{title}</Workspace>{error && <Status variant="admin" role="alert">{error}</Status>}{rows.map((r,i)=><Workspace part="section-row" key={r.id??i}>{render(r)}</Workspace>)}{cursor&&<Button variant="dense" onClick={()=>void load(cursor)}>{more}</Button>}</section>; }
