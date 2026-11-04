import { ZodError } from 'zod';
import type { PoolClient } from 'pg';
import type { Namespace, Socket } from 'socket.io';
import { performance } from 'node:perf_hooks';
import { pool } from './db/index.server';
import { authorize, onMembershipChange, onLibraryChange } from './domain.server';
import { logError } from './logger.server';
import { env } from './env.server';
import { envelopeSchema, joinSchema, stateSchema, type RehearsalState, type Ack } from '../src/rehearsal/contract';
import { apply, initialState, restartPaused } from '../src/rehearsal/controller';
import { TIMING_DERIVATION_VERSION, type PieceTiming } from '../src/rehearsal/timeline';
import { validateScore } from './score-validation.server';
export const serverNow = () => performance.timeOrigin + performance.now();
const empty: PieceTiming = { baseBpm: 100, totalBeats: 0, tempos: [{ beat: 0, bpm: 100 }], measures: [] };
let ownershipReady = false;
export const rehearsalReady = () => ownershipReady;
export function installRehearsal(ns: Namespace, options: { now?: () => number; idleMs?: number } = {}) {
    const now = options.now ?? serverNow;
    let owner: PoolClient | undefined;
    const committed = new Map<string, RehearsalState>();
    const depths = new Map<string, number>();
    const idle = new Map<string, ReturnType<typeof setTimeout>>();
    const buckets = new Map<string, {tokens:number; at:number}>();
    function admit(key:string, rate=5, burst=20) {
        const time=now(), b=buckets.get(key) ?? {tokens:burst,at:time};
        b.tokens=Math.min(burst,b.tokens+(time-b.at)*rate/1000); b.at=time;
        buckets.delete(key); buckets.set(key,b);
        if(buckets.size>10000) buckets.delete(buckets.keys().next().value!);
        if(b.tokens<1)return false; b.tokens--; return true;
    }
    function errorCode(error: any): Ack['code'] {
        const code = error?.code ?? error?.message;
        if (/^22/.test(String(code)) || error instanceof ZodError || error?.name === 'ZodError') return 'invalid';
        if (['invalid_score','invalid_xml','empty_score','invalid_text','nesting_limit'].includes(code)) return 'invalid';
        return ['forbidden','session_expired','not_found','rate_limited','invalid'].includes(code) ? code : 'unavailable';
    }
    const queues = new Map<string, Promise<unknown>>(), timers = new Map<string, ReturnType<typeof setTimeout>>();
    const versions = new Map<string, {content_hash:string;format:'score'|'musicxml';timing:PieceTiming|null}>();
    const seen = new Map<string, Map<string, {at:number; ack:Ack}>>(), timings = new Map<string, Promise<PieceTiming>>();
    const membership = new Map<Socket, Set<string>>();
    let generation = 0, closed = false;
    function serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
        if ((depths.get(id) ?? 0) >= 32) return Promise.reject(Error('rate_limited'));
        depths.set(id,(depths.get(id) ?? 0)+1);
        const result = (queues.get(id) ?? Promise.resolve()).catch(() => { }).then(fn); queues.set(id, result); void result.finally(() => { depths.set(id,depths.get(id)!-1); if (queues.get(id) === result)
        { queues.delete(id); depths.delete(id); } }).catch(() => { }); return result; }
    async function timing(e: string, p: string | null, v: number | null): Promise<PieceTiming> {
        if (!p)
            return empty;
        const key=JSON.stringify([e,p,v]);
        let row=versions.get(key);
        if(!row) { row=(await pool.query('select content_hash,format,timing from score_versions where ensemble_id=$1 and piece_id=$2 and version_no=$3', [e,p,v])).rows[0];
            if(row) { versions.set(key,row); if(versions.size>100) versions.delete(versions.keys().next().value!); } }
        if (!row)
            throw Error('not_found');
        if (row.timing?.derivationVersion===TIMING_DERIVATION_VERSION) return row.timing;
        let value = timings.get(row.content_hash);
        if (!value) {
            value = (async () => {
                // Read native JSON as text: parsing/stringifying a large body belongs in the worker.
                const body = await pool.query('select native_score::text,musicxml from score_versions where ensemble_id=$1 and piece_id=$2 and version_no=$3', [e,p,v]);
                if (!body.rows[0]) throw Error('not_found');
                const derived = (await validateScore(row.format === 'score' ? body.rows[0].native_score : body.rows[0].musicxml, row.format, true)).timing!;
                await pool.query("update score_versions set timing=$4 where ensemble_id=$1 and piece_id=$2 and version_no=$3 and (timing is null or timing->>'derivationVersion' is distinct from $5)",[e,p,v,JSON.stringify(derived),String(TIMING_DERIVATION_VERSION)]);
                row.timing=derived;
                return derived;
            })();
            timings.set(row.content_hash, value);
            void value.catch(() => timings.delete(row.content_hash));
            if (timings.size > 100)
                timings.delete(timings.keys().next().value!);
        }
        return value;
    }
    async function load(e: string, u = 'server') {
        if (committed.has(e)) return committed.get(e)!;
        const { rows } = await pool.query('select state from rehearsal_sessions where ensemble_id=$1', [e]);
        const state = rows.length ? stateSchema.parse(rows[0].state) : initialState(e,u,now());
        if (!committed.has(e)) committed.set(e,state);
        return committed.get(e)!;
    }
    async function persist(s: RehearsalState, checkLead = false) {
        if(!stateSchema.safeParse(s).success) throw Error('invalid');
        const ownerAtStart=owner;
        if(!ownerAtStart || closed)throw Error('unavailable');
        const db = checkLead ? await pool.connect() : pool;
        try {
        if(checkLead) await db.query('begin');
        if(owner!==ownerAtStart || closed)throw Error('unavailable');
        const result = await db.query('insert into rehearsal_sessions(ensemble_id,revision,state) values($1,$2,$3) on conflict(ensemble_id) do update set revision=excluded.revision,state=excluded.state,updated_at=now() where rehearsal_sessions.revision < excluded.revision returning revision', [s.ensembleId,s.revision,JSON.stringify(s)]);
        if (!result.rowCount) { committed.delete(s.ensembleId); throw Error('unavailable'); }
        if(checkLead && env.PLAYBACK_LEAD_MS>0 && (s.effectiveAt ?? s.anchor.serverTime)-now()<Math.min(50,env.PLAYBACK_LEAD_MS)) throw Error('unavailable');
        if(owner!==ownerAtStart || closed)throw Error('unavailable');
        if(checkLead) await db.query('commit');
        committed.set(s.ensembleId,s);
        } catch(error) { if(checkLead) await db.query('rollback'); if(!committed.has(s.ensembleId)) await load(s.ensembleId); throw error; }
        finally { if(checkLead) (db as PoolClient).release(); }
    }
    async function publish(s: RehearsalState, checkLead = false) {
        if(closed || !ownershipReady) throw Error('unavailable');
        await persist(s,checkLead);
        if (closed || !ownershipReady) return;
        ns.to(`rehearsal:${s.ensembleId}`).emit('playback:state',s); schedule(s);
    }
    function schedule(s: RehearsalState, failures=0) {
        clearTimeout(timers.get(s.ensembleId));
        timers.delete(s.ensembleId);
        if (s.endsAt === null || closed || !ownershipReady)
            return;
        const timer = setTimeout(() => { void serial(s.ensembleId, async () => { const current = await load(s.ensembleId); if (current.revision !== s.revision)
            return; if (current.endsAt !== null && now() < current.endsAt) {
            schedule(current);
            return;
        } await publish({ ...current, revision: current.revision + 1, status: 'stopped', anchor: { serverTime: current.endsAt!, beat: (await timing(current.ensembleId, current.pieceId, current.versionNo)).totalBeats }, countInUntil: null, startingTonesUntil: null, endsAt: null, updatedAt: now() }); }).catch(error => { logError('rehearsal.end', error); if (!closed && ownershipReady) { const retry=setTimeout(()=>schedule(committed.get(s.ensembleId) ?? s,failures+1),Math.min(30000,250*2**failures)); retry.unref(); timers.set(s.ensembleId,retry); } }); }, Math.min(2147483647, Math.max(0, s.endsAt - now())));
        timer.unref();
        timers.set(s.ensembleId, timer);
    }
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures=0;
    const deletedPieces=new Map<string,Set<string>>();
    async function reconcileDeleted(e:string) {
      await serial(e,async()=>{
        const pieces=deletedPieces.get(e);if(!pieces)return;
        const s=await load(e);
        if(s.pieceId && pieces.has(s.pieceId))await publish({...initialState(e,s.updatedBy,now()),revision:s.revision+1});
        deletedPieces.delete(e);
      });
    }
    const pendingRecovery=new Map<string,RehearsalState>();
    function loseOwnership() {
        ownershipReady=false;
        clearInterval(heartbeat);
        for(const timer of timers.values()) clearTimeout(timer);
        for(const timer of idle.values()) clearTimeout(timer);
        timers.clear(); idle.clear(); committed.clear();
        const client=owner; owner=undefined;
        if(client) client.release(true);
        retryOwnership();
    }
    function retryOwnership() {
        if(closed || retry) return;
        retry=setTimeout(()=>{retry=undefined;ready=acquire();void ready.catch(()=>{});},Math.min(30000,250*2**Math.min(failures++,7)));
        retry.unref();
    }
    async function acquire() {
      let client: PoolClient | undefined;
      try {
        client=await pool.connect();
        if(closed) {client.release();throw Error('unavailable');}
        owner=client;
        client.on('error',()=>{if(owner===client)loseOwnership();});
        const lock=await client.query('select pg_try_advisory_lock(714083, 1) as locked');
        if(!lock.rows[0].locked) throw Error('unavailable');
        // A query detects dead owner sessions even without subsequent commands.
        const probe={text:'select 1',query_timeout:2000};
        const ownerClient=client;
        let heartbeatFailures=0, probing=false;
        heartbeat=setInterval(()=>{
          if(probing || owner!==ownerClient)return;
          probing=true;
          void ownerClient.query(probe).then(()=>{heartbeatFailures=0;}).catch(error=>{
            logError('rehearsal.heartbeat',error);
            if(owner===ownerClient && ++heartbeatFailures>=3)loseOwnership();
          }).finally(()=>{probing=false;});
        },5000);
        heartbeat.unref();
        for(const recovered of pendingRecovery.values()) {
          const existing=(await pool.query('select state from rehearsal_sessions where ensemble_id=$1',[recovered.ensembleId])).rows[0]?.state;
          if(!existing || existing.revision<recovered.revision)await persist(recovered);
          pendingRecovery.delete(recovered.ensembleId);
        }
        const {rows} = await pool.query('select ensemble_id,revision,state from rehearsal_sessions');
        for(const row of rows) {
            let s: RehearsalState;
            try { s=stateSchema.parse(row.state); if(s.ensembleId!==row.ensemble_id || s.revision!==row.revision) throw Error('invalid'); }
            catch {
                // Preserve JSON shape and numeric diagnostics; redact every string (including IDs).
                const bad=JSON.parse(JSON.stringify(row.state),(_key,value)=>typeof value==='string'?'[redacted]':value);
                console.error(JSON.stringify({timestamp:new Date().toISOString(),event:'rehearsal.recovery.invalid',ensembleId:row.ensemble_id,badState:bad}));
                const safe={...initialState(row.ensemble_id,'server',now()),revision:row.revision+1};
                committed.set(safe.ensembleId,safe);pendingRecovery.set(safe.ensembleId,safe);await persist(safe);pendingRecovery.delete(safe.ensembleId);
                continue;
            }
            if(s.status!=='playing' && s.status!=='countingIn') { committed.set(s.ensembleId,s); continue; }
            let recovered: RehearsalState;
            try { recovered=restartPaused(s,now(),await timing(s.ensembleId,s.pieceId,s.versionNo)); }
            catch(error) {
                logError('rehearsal.recovery.timing',error);
                recovered={...s,revision:Math.max(row.revision,s.revision)+1,status:'paused',anchor:{...s.anchor,serverTime:now()},countInUntil:null,startingTonesUntil:null,endsAt:null,updatedAt:now()};
            }
            committed.set(recovered.ensembleId,recovered);pendingRecovery.set(recovered.ensembleId,recovered);
            await persist(recovered);pendingRecovery.delete(recovered.ensembleId);
        }
        if(owner!==client || closed) throw Error('unavailable');
        ownershipReady=true;failures=0;
        for(const e of deletedPieces.keys())await reconcileDeleted(e);
        for(const state of committed.values())if(ns.adapter.rooms.get(`rehearsal:${state.ensembleId}`)?.size)ns.to(`rehearsal:${state.ensembleId}`).emit('playback:state',state);
      } catch(error) {
        logError('rehearsal.recovery',error);if(owner===client)loseOwnership();else if(!owner)retryOwnership();throw error;
      }
    }
    let ready=acquire();void ready.catch(()=>{});
    async function waitReady() {
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {await Promise.race([ready,new Promise<never>((_,reject)=>{deadline=setTimeout(()=>reject(Error('unavailable')),500);deadline.unref();})]);}
        finally{clearTimeout(deadline);}
        if(!ownershipReady)throw Error('unavailable');
    }
    async function member(socket: Socket, e: string) {
        if (closed || !ownershipReady) throw Error('unavailable');
        if (socket.data.expiresAt <= now()) throw Error('session_expired');
        if (!socket.connected)
            throw Error('forbidden');
        let set = membership.get(socket);
        if (!set) {
            set = new Set();
            membership.set(socket, set);
        }
        if (set.has(e))
            return;
        const epoch = generation;
        try { await authorize(pool, socket.data.userId, e); } catch(error:any) { if(error.code==='not_found') throw Error('forbidden'); throw error; }
        if (epoch !== generation)
            return member(socket, e);
        if (!socket.connected)
            throw Error('forbidden');
        set.add(e);
    }
    function armIdle(ensembles: Iterable<string>) {
            if(closed || !ownershipReady)return;
            for(const e of ensembles) {
                if(ns.adapter.rooms.get(`rehearsal:${e}`)?.size) continue;
                if(idle.has(e)) continue;
                const timer=setTimeout(()=>{ idle.delete(e); seen.delete(e); void serial(e,async()=>{
                    if(ns.adapter.rooms.get(`rehearsal:${e}`)?.size) return;
                    const s=await load(e);
                    if(s.status==='playing'||s.status==='countingIn') await publish(restartPaused(s,now(),await timing(e,s.pieceId,s.versionNo)));
                    committed.delete(e);
                }).catch(error=>logError('rehearsal.idle',error)); },options.idleMs ?? env.PLAYBACK_IDLE_MS ?? 600000);
                timer.unref(); idle.set(e,timer);
            }
    }
    const offMember = onMembershipChange((e, u, removed) => { generation++; for (const [socket, set] of membership) {
        if (u && socket.data.userId !== u)
            continue;
        set.delete(e);
        if (removed)
            void Promise.resolve(socket.leave(`rehearsal:${e}`)).then(()=>armIdle([e]));
    } });
    const offLibrary = onLibraryChange(async (e, changes) => {
      versions.clear();
      const pieces=deletedPieces.get(e)??new Set<string>();
      for(const change of changes as {deleted?:boolean;pieceId:string}[])if(change.deleted)pieces.add(change.pieceId);
      if(!pieces.size)return;
      deletedPieces.set(e,pieces);
      // Retain invalidations through an unavailable owner; acquire drains them.
      if(!ownershipReady)return;
      try{await reconcileDeleted(e);}catch(error){logError('rehearsal.library',error);loseOwnership();}
    });
    ns.on('connection', socket => {
        if ([...ns.sockets.values()].filter(s=>s.data.userId===socket.data.userId).length>10) { socket.emit('rehearsal:closed',{code:'socket_limit'});socket.disconnect(true); return; }
        let inFlight=0;
        socket.on('clock:ping', (ack: unknown) => { if (typeof ack === 'function' && admit('ping:'+socket.id,10,20))
            ack({ serverTime: now() }); });
        for (const event of ['rehearsal:join', 'rehearsal:snapshot'])
            socket.on(event, async (input: unknown, ack: unknown) => {
                if (typeof ack !== 'function')
                    return;
                const parsed = joinSchema.safeParse(input);
                if (!parsed.success)
                    return ack({ code: 'invalid' });
                const e=parsed.data.ensembleId;
                if(inFlight>=4 || !admit('read:socket:'+socket.id) || !admit('read:user:'+socket.data.userId)) return ack({code:'rate_limited'});
                inFlight++;
                try {
                    await waitReady();
                    await member(socket,e);
                    if(!admit('read:ensemble:'+e,50,100)) throw Error('rate_limited');
                    await socket.join(`rehearsal:${e}`);
                    clearTimeout(idle.get(e)); idle.delete(e);
                    const state=await load(e,socket.data.userId);
                    await member(socket,e); ack({state});
                }
                catch (error) {
                    logError('rehearsal.join', error);
                    ack({ code: errorCode(error) });
                } finally { inFlight--; }
            });
        socket.on('rehearsal:command', async (input: unknown, callback: unknown) => {
            const ack = typeof callback === 'function' ? callback : () => { };
            const parsed = envelopeSchema.safeParse(input);
            const commandId = typeof (input as any)?.commandId === 'string' ? (input as any).commandId : '';
            const reject = (code: Ack['code']) => ack({ commandId, status: 'rejected', code });
            const receivedAt=now();
            if(inFlight>=4 || !admit('cmd:socket:'+socket.id) || !admit('cmd:user:'+socket.data.userId)) return reject('rate_limited');
            if (!parsed.success)
                return reject('invalid');
            const e = parsed.data;
            inFlight++;
            try {
                await waitReady();
                await serial(e.ensembleId, async () => {
                    try {
                        if (!socket.rooms.has(`rehearsal:${e.ensembleId}`)) throw Error('forbidden');
                        await member(socket, e.ensembleId);
                    }
                    catch(error) {
                        return reject(errorCode(error));
                    }
                    if(!admit('cmd:ensemble:'+e.ensembleId,50,100)) return reject('rate_limited');
                    let ids = seen.get(e.ensembleId);
                    if (!ids) {
                        ids = new Map();
                        seen.set(e.ensembleId, ids);
                    }
                    for (const [id, entry] of ids)
                        if (receivedAt - entry.at > 600000)
                            ids.delete(id);
                    if (ids.has(e.commandId))
                        return ack(ids.get(e.commandId)!.ack);
                    const s = await load(e.ensembleId, socket.data.userId);
                    let t: PieceTiming;
                    try {
                        t = await timing(e.ensembleId, e.command.type === 'selectPiece' ? e.command.pieceId : s.pieceId, e.command.type === 'selectPiece' ? e.command.versionNo : s.versionNo);
                    }
                    catch(error) {
                        return reject(errorCode(error));
                    }
                    const next = apply(s, e, { now: now(), leadTimeMs: env.PLAYBACK_LEAD_MS, pieceTiming: t, userId: socket.data.userId });
                    if ('code' in next)
                        return ack({commandId,status:'rejected',code:next.code,revision:s.revision,state:s});
                    try {
                        if (!socket.rooms.has(`rehearsal:${e.ensembleId}`)) throw Error('forbidden');
                        await member(socket, e.ensembleId);
                    }
                    catch(error) {
                        return reject(errorCode(error));
                    }
                    if (next !== s) await publish(next,true);
                    const original:Ack={commandId:e.commandId,status:'accepted',revision:next.revision};
                    ids.set(e.commandId, {at:now(),ack:original});
                    if (ids.size > 1000)
                        ids.delete(ids.keys().next().value!);
                    ack({ commandId: e.commandId, status: 'accepted', revision: next.revision });
                });
            }
            catch (error) {
                logError('rehearsal.command', error);
                reject(errorCode(error));
            } finally { inFlight--; }
        });
        socket.on('disconnect', () => {
            const ensembles=membership.get(socket); membership.delete(socket);
            armIdle(ensembles ?? []);
        });
    });
    return async () => { closed = true; ownershipReady=false;clearInterval(heartbeat);clearTimeout(retry); offMember(); offLibrary(); for(const timer of idle.values()) clearTimeout(timer);
        await Promise.allSettled([...queues.values()]); await ready.finally(async()=>{ if(owner) { const client=owner; owner=undefined; try { await client.query('select pg_advisory_unlock(714083,1)'); } finally { client.release(); } } }).catch(error=>logError('rehearsal.close',error)); for (const timer of timers.values())
        clearTimeout(timer); };
}
