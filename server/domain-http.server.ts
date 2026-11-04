import { registerTranscriptionRoutes } from './transcription-http.server';
import { TIMING_DERIVATION_VERSION } from '../src/rehearsal/timeline';
import { Hono } from "hono";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { validateScore } from "./score-validation.server";
import { verifyPassword } from "better-auth/crypto";
import { currentSession } from "./auth.server";
import { pool } from "./db/index.server";
import {
  DomainError,
  transaction,
  authorize,
  lockEnsemble,
  protectLead,
  audit,
  membershipChanged,
  libraryChanged,
} from "./domain.server";
import {
  ensembleInput,
  memberInput,
  invitationInput,
  createPieceInput,
  versionInput,
  settingsInput,
  reorderInput,
} from "../src/api/domain";
import { mailer } from "./mail.server";
import { env } from "./env.server";
import { logError } from "./logger.server";
import type { PoolClient } from "pg";
export const domain = new Hono<{
  Variables: { user: { id: string; email: string; name: string } };
}>();
// Injectable application clock; tests change it in-process, never through HTTP or environment bypasses.
export const clock = { now: () => new Date() };
function canonicalJSON(value: unknown, depth = 0): string {
  if (depth > 64) throw new DomainError("nesting_limit", 422);
  if (Array.isArray(value))
    return "[" + value.map((v) => canonicalJSON(v, depth + 1)).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(
          ([key, value]) =>
            JSON.stringify(key) + ":" + canonicalJSON(value, depth + 1),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
function scoreTitle(raw: string) {
  try { return decodeURIComponent(raw); }
  catch { throw new DomainError("invalid_text", 422); }
}
async function readBody(req: { json: () => Promise<unknown> }) {
  const value = await req.json();
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length) {
    const [v, depth] = stack.pop()!;
    if (depth > 64) throw new DomainError("nesting_limit", 422);
    if (typeof v === "string" && (v.includes("\0") || !v.isWellFormed())) throw new DomainError("invalid_text", 422);
    if (v && typeof v === "object")
      for (const [key,child] of Object.entries(v)) {if((key.includes("\0") || !key.isWellFormed())) throw new DomainError("invalid_text",422);stack.push([child, depth + 1]);}
  }
  return value;
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function limit(
  db: Pick<PoolClient, "query">,
  key: string,
  max: number,
  window: number,
) {
  const now = clock.now().getTime();
  const r = await db.query(
    `insert into rate_limit(key,count,last_request) values($1,1,$2) on conflict(key) do update set count=case when rate_limit.last_request <= $2-$3 then 1 else rate_limit.count+1 end,last_request=case when rate_limit.last_request <= $2-$3 then $2 else rate_limit.last_request end returning count`,
    [key, now, window],
  );
  if (r.rows[0].count > max) throw new DomainError("rate_limited", 429);
}
async function invitationBudget(
  db: PoolClient,
  e: string,
  email: string,
  u: string,
) {
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    "inviter:" + u,
  ]);
  const now = clock.now(),
    since = new Date(now.getTime() - 86400000);
  const r = (
    await db.query(
      `select count(*) filter(where ensemble_id=$1 and email=$2)::int as recipient, max(created_at) filter(where ensemble_id=$1 and email=$2) as last, count(*) filter(where ensemble_id=$1)::int as ensemble, count(*) filter(where inviter_id=$3)::int as inviter from invitation_sends where created_at > $4 and (ensemble_id=$1 or inviter_id=$3)`,
      [e, email, u, since],
    )
  ).rows[0];
  if (r.last && now.getTime() - new Date(r.last).getTime() < 60000)
    throw new DomainError("send_cooldown", 429);
  if (r.recipient >= 5) throw new DomainError("send_limit", 429);
  if (
    r.ensemble >= env.INVITE_ENSEMBLE_DAILY_MAX ||
    r.inviter >= env.INVITE_USER_DAILY_MAX
  )
    throw new DomainError("send_daily_limit", 429);
  await db.query(
    "insert into invitation_sends(ensemble_id,email,inviter_id,created_at) values($1,$2,$3,$4)",
    [e, email, u, now],
  );
}
async function revokeIssued(db: PoolClient, e: string, u: string) {
  await db.query(
    "update invitations set state='revoked',revoked_at=$3 where ensemble_id=$1 and inviter_id=$2 and state='pending'",
    [e, u, clock.now()],
  );
}
async function replay(
  db: PoolClient,
  e: string,
  u: string,
  op: string,
  key: string | undefined,
  input: unknown,
) {
  if (!key) return;
  const r = (
    await db.query(
      "select * from idempotency_records where ensemble_id=$1 and user_id=$2 and operation=$3 and request_key=$4 and created_at > $5",
      [e, u, op, key, new Date(clock.now().getTime() - 86400000)],
    )
  ).rows[0];
  if (r && r.request_hash !== hash(canonicalJSON(input)))
    throw new DomainError("idempotency_mismatch", 422);
  if (r && (op === "invite" || op.startsWith("resend:")))
    return (
      (await db.query("select * from invitations where id=$1", [r.response.id]))
        .rows[0] ?? r.response
    );
  return r?.response;
}
async function remember(
  db: PoolClient,
  e: string,
  u: string,
  op: string,
  key: string | undefined,
  input: unknown,
  response: unknown,
) {
  if (key)
    await db.query(
      `insert into idempotency_records(ensemble_id,user_id,operation,request_key,request_hash,response,created_at) values($1,$2,$3,$4,$5,$6,$7) on conflict(ensemble_id,user_id,operation,request_key) do update set request_hash=excluded.request_hash,response=excluded.response,created_at=excluded.created_at`,
      [
        e,
        u,
        op,
        key,
        hash(canonicalJSON(input)),
        JSON.stringify(response),
        clock.now(),
      ],
    );
}
const caps = (m: Record<string, unknown>) => ({
  manageMembers: !!(m.is_lead || m.manage_members),
  editPieces: !!(m.is_lead || m.edit_music_pieces),
  transcribe: !!(m.is_lead || m.ai_transcription),
});
const grantedCaps = (m: Record<string, unknown>) => ({manageMembers: !!m.manage_members, editPieces: !!m.edit_music_pieces, transcribe: !!m.ai_transcription});
const memberView = (m: Record<string, unknown>) => ({
  id: m.id,
  userId: m.user_id,
  ensembleId: m.ensemble_id,
  name: m.name,
  email: m.email,
  isLead: m.is_lead,
  capabilities: caps(m),
});
const inviteState = (i: Record<string, unknown>) =>
  i.state === "pending" && new Date(String(i.expires_at)) <= clock.now()
    ? "expired"
    : i.state;
const inviteView = (i: Record<string, unknown>) => ({
  id: i.id,
  email: i.email,
  state: inviteState(i),
  expiresAt: i.expires_at,
  deliveryState: i.delivery_state,
  sendCount: i.send_count,
  capabilities: caps(i),
});
domain.onError(async (error, c) => {
  if (
    error instanceof DomainError &&
    [403, 404].includes(error.status) &&
    !["GET", "HEAD"].includes(c.req.method) &&
    c.get("user")
  ) {
    try {
      await limit(pool, "denied-audit:" + c.get("user").id, 10, 60000);
      await pool.query(
        "insert into audit_events(actor_id,action,target_id,outcome) values($1,'domain.mutation',$2,'denied')",
        [c.get("user").id, c.req.param("ensemble") ?? null],
      );
    } catch (auditError) {
      if (!(auditError instanceof DomainError))
        logError("audit.denied", auditError);
    }
  }
  if (error instanceof DomainError)
    return c.json(
      { code: error.code, current: error.current },
      error.status as 400,
    );
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return c.json({ code: "invalid_input" }, 400);
  logError("domain.http", error);
  return c.json({ code: "service_unavailable" }, 500);
});
domain.get("/invitations/:token", async (c) => {
  const i = (
    await pool.query(
      'select i.*,e.name as ensemble_name,u.name as inviter_name from invitations i join ensembles e on e.id=i.ensemble_id left join "user" u on u.id=i.inviter_id where token_hash=$1',
      [hash(c.req.param("token"))],
    )
  ).rows[0];
  if (!i) {
    if (
      (
        await pool.query(
          "select 1 from superseded_invitations where token_hash=$1",
          [hash(c.req.param("token") ?? "")],
        )
      ).rowCount
    )
      throw new DomainError("superseded", 409);
    throw new DomainError("not_found", 404);
  }
  return c.json({
    ensembleName: i.ensemble_name,
    inviter: i.inviter_name,
    email: i.email.replace(/^(.).*(@.*)$/, "$1***$2"),
    state: inviteState(i),
    callbackURL: `${env.BETTER_AUTH_URL}/invite/${encodeURIComponent(c.req.param("token"))}`,
  });
});
domain.use("*", async (c, next) => {
  const s = await currentSession(c.req.raw.headers);
  if (!s?.user.emailVerified) return c.json({ code: "SESSION_EXPIRED" }, 401);
  c.set("user", s.user);
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method))
    await limit(pool, "domain:" + s.user.id, env.DOMAIN_USER_MINUTE_MAX, 60000);
  await next();
});
domain.get("/ensembles", async (c) => {
  const rows = await pool.query(
    "select e.*,m.id as membership_id,m.user_id,m.is_lead,m.manage_members,m.edit_music_pieces,m.ai_transcription from ensembles e join memberships m on m.ensemble_id=e.id where m.user_id=$1 order by e.name",
    [c.get("user").id],
  );
  return c.json(
    rows.rows.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      isLead: e.is_lead,
      membershipId: e.membership_id,
      capabilities: caps(e),
    })),
  );
});
domain.post("/ensembles", async (c) => {
  const input = ensembleInput.parse(await readBody(c.req)),
    u = c.get("user");
  const result = await transaction(async (db) => {
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      u.id,
    ]);
    await limit(
      db,
      "ensemble-create:" + u.id,
      env.ENSEMBLE_USER_DAILY_MAX,
      86400000,
    );
    const e = (
      await db.query(
        "insert into ensembles(name,kind) values($1,$2) returning *",
        [input.name, input.kind],
      )
    ).rows[0];
    await db.query(
      "insert into memberships(ensemble_id,user_id,is_lead) values($1,$2,true)",
      [e.id, u.id],
    );
    await audit(db, e.id, u.id, "ensemble.create", e.id);
    const m = await authorize(db, u.id, e.id);
    return { ...e, membershipId: m.id, isLead: true, capabilities: caps(m) };
  });
  membershipChanged(result.id, u.id);
  return c.json(result, 201);
});
domain.patch("/ensembles/:ensemble", async (c) => {
  const input = ensembleInput.pick({ name: true }).parse(await readBody(c.req)),
    e = c.req.param("ensemble"),
    u = c.get("user");
  const response = await transaction(async (db) => {
      await lockEnsemble(db, e);
      await authorize(db, u.id, e, "lead");
      const result = await db.query(
        "update ensembles set name=$1 where id=$2 returning id,name,kind",
        [input.name, e],
      );
      await audit(db, e, u.id, "ensemble.rename", e);
      const m = await authorize(db, u.id, e);
      return {
        ...result.rows[0],
        membershipId: m.id,
        isLead: m.is_lead,
        capabilities: caps(m),
      };
    });
  membershipChanged(e);
  return c.json(response);
});
domain.get("/ensembles/:ensemble/members", async (c) => {
  const e = c.req.param("ensemble");
  await authorize(pool, c.get("user").id, e, "manageMembers");
  return c.json(
    (
      await pool.query(
        'select m.*,u.name,u.email from memberships m join "user" u on u.id=m.user_id where ensemble_id=$1',
        [e],
      )
    ).rows.map(memberView),
  );
});
domain.patch("/ensembles/:ensemble/members/:member", async (c) => {
  const input = memberInput.parse(await readBody(c.req)),
    e = c.req.param("ensemble"),
    id = c.req.param("member"),
    u = c.get("user");
  const result = await transaction(async (db) => {
    await lockEnsemble(db, e);
    const actor = await authorize(db, u.id, e, "lead");
    const m = (
      await db.query(
        "select * from memberships where id=$1 and ensemble_id=$2",
        [id, e],
      )
    ).rows[0];
    if (!m) throw new DomainError("not_found", 404);
    if (input.stepDown && m.user_id === u.id && input.isLead)
      throw new DomainError("invalid_input");
    if (input.isLead === false && m.is_lead) await protectLead(db, e, m);
    const result = (
      await db.query(
        "update memberships set is_lead=coalesce($1,is_lead),manage_members=coalesce($2,manage_members),edit_music_pieces=coalesce($3,edit_music_pieces),ai_transcription=coalesce($4,ai_transcription) where id=$5 returning *",
        [
          input.isLead,
          input.manageMembers,
          input.editPieces,
          input.transcribe,
          id,
        ],
      )
    ).rows[0];
    if (input.stepDown) {
      if (!input.isLead || m.user_id === u.id)
        throw new DomainError("invalid_transfer");
      await protectLead(db, e, actor);
      await db.query("update memberships set is_lead=false where id=$1", [
        actor.id,
      ]);
      await audit(db,e,u.id,"membership.permissions",actor.id,{old:{isLead:actor.is_lead,capabilities:grantedCaps(actor)},new:{isLead:false,capabilities:grantedCaps(actor)}});
    }
    if (
      (m.is_lead && input.isLead === false) ||
      (m.manage_members && input.manageMembers === false)
    )
      await revokeIssued(db, e, m.user_id);
    if (input.stepDown) await revokeIssued(db, e, u.id);
    await audit(db, e, u.id, "membership.permissions", id, { old: { isLead: m.is_lead, capabilities: grantedCaps(m) }, new: { isLead: result.is_lead, capabilities: grantedCaps(result) } });
    return memberView(result);
  });
  membershipChanged(e, String(result.userId));
  if (input.stepDown) membershipChanged(e, u.id);
  return c.json(result);
});
domain.delete("/ensembles/:ensemble/members/:member", async (c) => {
  const e = c.req.param("ensemble"),
    id = c.req.param("member"),
    u = c.get("user");
  let removed = "";
  await transaction(async (db) => {
    await lockEnsemble(db, e);
    const actor = await authorize(db, u.id, e);
    const m = (
      await db.query(
        "select * from memberships where ensemble_id=$1 and id=$2",
        [e, id],
      )
    ).rows[0];
    if (!m) throw new DomainError("not_found", 404);
    if (m.user_id !== u.id) {
      await authorize(db, u.id, e, "manageMembers");
      if (m.is_lead && !actor.is_lead) throw new DomainError("forbidden", 403);
    }
    await protectLead(db, e, m);
    await revokeIssued(db, e, m.user_id);
    await db.query("delete from memberships where id=$1", [id]);
    await audit(
      db,
      e,
      u.id,
      m.user_id === u.id ? "membership.leave" : "membership.remove",
      id,
    );
    removed = m.user_id;
  });
  membershipChanged(e, removed, true);
  return c.json({ status: true });
});
domain.get("/account/deletion", async (c) => {
  const rows = await pool.query(
    `select e.id,e.name,count(m.id)::int as members,count(m.id) filter(where m.is_lead)::int as leads,bool_or(m.user_id=$1 and m.is_lead) as own_lead from ensembles e join memberships m on m.ensemble_id=e.id where e.id in(select ensemble_id from memberships where user_id=$1) group by e.id order by e.id`,
    [c.get("user").id],
  );
  return c.json({
    deleteEnsembles: rows.rows
      .filter((r) => r.members === 1)
      .map((r) => ({ id: r.id, name: r.name })),
    lastLead: rows.rows
      .filter((r) => r.members > 1 && r.leads === 1 && r.own_lead)
      .map((r) => r.id),
  });
});
domain.delete("/account", async (c) => {
  const u = c.get("user");
  const input = z
    .object({
      deleteEnsembleIds: z.array(z.string()).max(1000).optional(),
      password: z.string().max(1000).optional(),
    })
    .strict()
    .parse(await readBody({json: async () => {
      const text = await c.req.text();
      return text ? JSON.parse(text) : {};
    }}));
  const session = await currentSession(c.req.raw.headers);
  if (
    !session ||
    clock.now().getTime() - new Date(session.session.createdAt).getTime() >
      600000
  ) {
    const failureKey = "account-password:" + u.id;
    const failures = (await pool.query("select count,last_request from rate_limit where key=$1", [failureKey])).rows[0];
    if (failures && failures.count >= 5 && Number(failures.last_request) > clock.now().getTime()-900000) throw new DomainError("rate_limited", 429);
    const credential = (
      await pool.query(
        "select password from account where user_id=$1 and provider_id='credential'",
        [u.id],
      )
    ).rows[0];
    if (
      !input.password ||
      !credential?.password ||
      !(await verifyPassword({
        hash: credential.password,
        password: input.password,
      }))
    )
      { await limit(pool, failureKey, 5, 900000); throw new DomainError("recent_auth_required", 401); }
    await pool.query("delete from rate_limit where key=$1", [failureKey]);
  }
  await transaction(async (db) => {
    await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      u.id,
    ]);
    const es = (
      await db.query(
        "select ensemble_id from memberships where user_id=$1 order by ensemble_id",
        [u.id],
      )
    ).rows;
    const sole: string[] = [],
      last: string[] = [];
    for (const { ensemble_id: e } of es) {
      await lockEnsemble(db, e);
      const rows = (
        await db.query("select * from memberships where ensemble_id=$1", [e])
      ).rows;
      if (rows.length === 1) sole.push(e);
      else if (
        rows.filter((m) => m.is_lead).length === 1 &&
        rows.some((m) => m.user_id === u.id && m.is_lead)
      )
        last.push(e);
    }
    if (last.length) throw new DomainError("last_lead", 409, last);
    if (
      !input.deleteEnsembleIds ||
      JSON.stringify([...new Set(input.deleteEnsembleIds)].sort()) !==
        JSON.stringify(sole.sort()) ||
      new Set(input.deleteEnsembleIds).size !== input.deleteEnsembleIds.length
    )
      throw new DomainError("confirm_ensemble_deletion", 409, sole);
    await db.query(
      "insert into audit_events(actor_id,action,target_id,outcome) values($1,'account.delete',$1,'ok')",
      [u.id],
    );
    for (const { ensemble_id: e } of es) {
      await revokeIssued(db, e, u.id);
      if (sole.includes(e)) {
        await db.query('insert into object_deletions(object_key) select object_key from stored_objects where ensemble_id=$1 on conflict do nothing',[e]);
        await db.query(
          "update music_pieces set current_version_id=null where ensemble_id=$1",
          [e],
        );
        for (const table of [
          "job_pages",
          "transcription_jobs",
          "stored_objects",
          "score_versions",
          "music_pieces",
          "rehearsal_sessions",
          "invitations",
          "memberships",
        ])
          await db.query(`delete from ${table} where ensemble_id=$1`, [e]);
        await db.query(
          "update audit_events set ensemble_id=null where ensemble_id=$1",
          [e],
        );
        await db.query("delete from ensembles where id=$1", [e]);
      }
    }
    await db.query("delete from idempotency_records where user_id=$1", [u.id]);
    await db.query("delete from invitation_sends where inviter_id=$1 or email=$2", [u.id, u.email]);
    await db.query('delete from "user" where id=$1', [u.id]);
  });
  membershipChanged("", u.id, true);
  return c.json({ status: true });
});

async function sendInvite(
  db: Pick<PoolClient, "query">,
  i: Record<string, any>,
  raw: string,
) {
  const e = (
    await db.query("select name from ensembles where id=$1", [i.ensemble_id])
  ).rows[0];
  const u = (
    await db.query('select name from "user" where id=$1', [i.inviter_id])
  ).rows[0];
  const de = i.language === "de";
  try {
    await mailer.send({
      idempotencyKey: `invitation-${i.id}-${i.send_count}`,
      to: i.email,
      subject: de ? `Einladung zu ${e.name}` : `Invitation to ${e.name}`,
      text: `${u?.name ?? "LightScore"} ${de ? "lädt dich ein zu" : "invites you to"} ${e.name}:\n${env.BETTER_AUTH_URL}/invite/${raw}`,
    });
    i.delivery_state = "sent";
  } catch (error) {
    logError("invitation.delivery", error);
    i.delivery_state = "not_sent";
  }
  await db.query(
    "update invitations set delivery_state=$1 where id=$2 and token_hash=$3",
    [i.delivery_state, i.id, i.token_hash],
  );
}
domain.get("/ensembles/:ensemble/invitations", async (c) => {
  const e = c.req.param("ensemble");
  await authorize(pool, c.get("user").id, e, "manageMembers");
  return c.json(
    (
      await pool.query(
        "select * from invitations where ensemble_id=$1 order by created_at",
        [e],
      )
    ).rows.map(inviteView),
  );
});
domain.post("/ensembles/:ensemble/invitations", async (c) => {
  const input = invitationInput.parse(await readBody(c.req)),
    e = c.req.param("ensemble"),
    u = c.get("user");
  const delivery = await transaction(async (db) => {
    await lockEnsemble(db, e);
    const actor = await authorize(db, u.id, e, "manageMembers");
    const cached = await replay(
      db,
      e,
      u.id,
      "invite",
      input.idempotencyKey,
      input,
    );
    if (cached)
      return { invitation: cached, raw: undefined as string | undefined };
    const cap = input.capabilities ? { ...input.capabilities } : {
      manageMembers: false,
      editPieces: false,
      transcribe: false,
    };
    if (!actor.is_lead && Object.values(cap).some(Boolean))
      throw new DomainError("forbidden", 403);
    if (
      (
        await db.query(
          'select m.id from memberships m join "user" u on u.id=m.user_id where ensemble_id=$1 and u.email=$2',
          [e, input.email],
        )
      ).rowCount
    )
      throw new DomainError("already_member", 409);
    const old = (
      await db.query(
        "select * from invitations where ensemble_id=$1 and email=$2 and state='pending' for update",
        [e, input.email],
      )
    ).rows[0];
    await invitationBudget(db, e, input.email, u.id);
    if (old) {
      await db.query(
        "insert into superseded_invitations(token_hash) values($1) on conflict do nothing",
        [old.token_hash],
      );
      if (!actor.is_lead) {
        cap.manageMembers = old.manage_members;
        cap.editPieces = old.edit_music_pieces;
        cap.transcribe = old.ai_transcription;
      }
    }
    const recipient = (
      await db.query('select language from "user" where email=$1', [
        input.email,
      ])
    ).rows[0];
    const raw = randomBytes(32).toString("base64url"),
      expiry = new Date(clock.now().getTime() + 14 * 86400000);
    const i = (
      await db.query(
        `insert into invitations(ensemble_id,email,inviter_id,token_hash,expires_at,manage_members,edit_music_pieces,ai_transcription,language,request_key,send_count,last_sent_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11) on conflict(ensemble_id,email) where state='pending' do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,inviter_id=excluded.inviter_id,manage_members=excluded.manage_members,edit_music_pieces=excluded.edit_music_pieces,ai_transcription=excluded.ai_transcription,language=excluded.language,request_key=excluded.request_key,delivery_state='not_sent',send_count=invitations.send_count+1,last_sent_at=excluded.last_sent_at returning *`,
        [
          e,
          input.email,
          old && !actor.is_lead ? old.inviter_id : u.id,
          hash(raw),
          expiry,
          cap.manageMembers,
          cap.editPieces,
          cap.transcribe,
          input.language ?? recipient?.language ?? "en",
          JSON.stringify([input.idempotencyKey]),
          clock.now(),
        ],
      )
    ).rows[0];

    await audit(
      db,
      e,
      u.id,
      old ? "invitation.resend" : "invitation.create",
      i.id,
    );
    await remember(db, e, u.id, "invite", input.idempotencyKey, input, i);
    return { invitation: i, raw };
  });
  if (delivery.raw) await sendInvite(pool, delivery.invitation, delivery.raw);
  return c.json(inviteView(delivery.invitation), 201);
});
domain.post(
  "/ensembles/:ensemble/invitations/:invitation/resend",
  async (c) => {
    const { idempotencyKey } = z
        .object({ idempotencyKey: z.string().min(1).max(200) })
        .strict()
        .parse(await readBody(c.req)),
      e = c.req.param("ensemble"),
      u = c.get("user");
    const delivery = await transaction(async (db) => {
      await lockEnsemble(db, e);
      await authorize(db, u.id, e, "manageMembers");
      const i = (
        await db.query(
          "select * from invitations where id=$1 and ensemble_id=$2 for update",
          [c.req.param("invitation"), e],
        )
      ).rows[0];
      if (!i) throw new DomainError("not_found", 404);
      const cached = await replay(db, e, u.id, "invite", idempotencyKey, {
        idempotencyKey,
        invitationId: i.id,
      });
      if (cached)
        return { invitation: cached, raw: undefined as string | undefined };
      if (i.state !== "pending") throw new DomainError(i.state);
      await invitationBudget(db, e, i.email, u.id);
      await db.query(
        "insert into superseded_invitations(token_hash) values($1) on conflict do nothing",
        [i.token_hash],
      );
      const raw = randomBytes(32).toString("base64url");
      Object.assign(
        i,
        (
          await db.query(
            "update invitations set token_hash=$1,expires_at=$2,request_key=$3,delivery_state='not_sent',send_count=send_count+1,last_sent_at=$4 where id=$5 returning *",
            [
              hash(raw),
              new Date(clock.now().getTime() + 14 * 86400000),
              JSON.stringify([idempotencyKey]),
              clock.now(),
              i.id,
            ],
          )
        ).rows[0],
      );

      await audit(db, e, u.id, "invitation.resend", i.id);
      await remember(
        db,
        e,
        u.id,
        "invite",
        idempotencyKey,
        { idempotencyKey, invitationId: i.id },
        i,
      );
      return { invitation: i, raw };
    });
    if (delivery.raw) await sendInvite(pool, delivery.invitation, delivery.raw);
    return c.json(inviteView(delivery.invitation));
  },
);
domain.delete("/ensembles/:ensemble/invitations/:invitation", async (c) => {
  const e = c.req.param("ensemble"),
    u = c.get("user");
  await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "manageMembers");
    const i = (
      await db.query(
        "select * from invitations where ensemble_id=$1 and id=$2 for update",
        [e, c.req.param("invitation")],
      )
    ).rows[0];
    if (!i) throw new DomainError("not_found", 404);
    if (i.state === "accepted") throw new DomainError("already_used", 409);
    await db.query(
      "update invitations set state='revoked',revoked_at=$1 where id=$2",
      [clock.now(), i.id],
    );
    await audit(db, e, u.id, "invitation.revoke", i.id);
  });
  return c.json({ status: true });
});
domain.post("/invitations/:token/accept", async (c) => {
  const u = c.get("user");
  const result = await transaction(async (db) => {
      await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        u.id,
      ]);
      if (!(await db.query('select id from "user" where id=$1', [u.id])).rowCount) throw new DomainError("SESSION_EXPIRED", 401);
      const initial = (
        await db.query(
          "select ensemble_id from invitations where token_hash=$1",
          [hash(c.req.param("token"))],
        )
      ).rows[0];
      if (!initial) {
        if (
          (
            await db.query(
              "select 1 from superseded_invitations where token_hash=$1",
              [hash(c.req.param("token"))],
            )
          ).rowCount
        )
          throw new DomainError("superseded", 409);
        throw new DomainError("not_found", 404);
      }
      await lockEnsemble(db, initial.ensemble_id);
      const i = (
        await db.query(
          "select * from invitations where token_hash=$1 for update",
          [hash(c.req.param("token"))],
        )
      ).rows[0];
      if (!i) throw new DomainError("not_found", 404);
      if (i.email !== u.email.trim().toLowerCase())
        throw new DomainError("wrong_account", 403);
      if (i.state === "accepted") {
        if (i.accepted_by !== u.id) throw new DomainError("already_used", 409);
        const m = (
          await db.query(
            "select * from memberships where ensemble_id=$1 and user_id=$2",
            [i.ensemble_id, u.id],
          )
        ).rows[0];
        if (!m) throw new DomainError("already_used", 409);
        return memberView(m);
      }
      const state = inviteState(i);
      if (state !== "pending") throw new DomainError(String(state), 409);
      const issuer = (
        await db.query(
          "select * from memberships where ensemble_id=$1 and user_id=$2",
          [i.ensemble_id, i.inviter_id],
        )
      ).rows[0];
      if (!issuer || (!issuer.is_lead && !issuer.manage_members))
        throw new DomainError("revoked", 409);
      if (!issuer.is_lead) {
        i.manage_members = false;
        i.edit_music_pieces = false;
        i.ai_transcription = false;
      }
      const m = (
        await db.query(
          "insert into memberships(ensemble_id,user_id,manage_members,edit_music_pieces,ai_transcription) values($1,$2,$3,$4,$5) on conflict(ensemble_id,user_id) do nothing returning *",
          [
            i.ensemble_id,
            u.id,
            i.manage_members,
            i.edit_music_pieces,
            i.ai_transcription,
          ],
        )
      ).rows[0];
      if (!m) throw new DomainError("already_member", 409);
      await db.query(
        "update invitations set state='accepted',accepted_at=$1,accepted_by=$2 where id=$3",
        [clock.now(), u.id, i.id],
      );
      await audit(db, i.ensemble_id, u.id, "invitation.accept", i.id);
      return memberView(m);
    });
  membershipChanged(String(result.ensembleId), u.id);
  return c.json(result);
});
const metadataSQL = `select p.id,p.ensemble_id as "ensembleId",p.title,p.sort_key as "sortKey",p.format,p.revision,v.version_no as "versionNo",v.content_hash as "contentHash",v.size::float8 as size,p.updated_at as "updatedAt",jsonb_build_object('partNames',p.part_names,'clefOverrides',p.clef_overrides,'removedParts',p.removed_parts,'splitParts',p.split_parts,'swing',p.swing,'savedConfig',p.saved_config,'formatDefaults',p.format_defaults) as settings from music_pieces p join score_versions v on v.id=p.current_version_id`;
async function metadata(db: Pick<PoolClient, "query">, e: string, id: string) {
  const row = (
    await db.query(metadataSQL + " where p.ensemble_id=$1 and p.id=$2", [e, id])
  ).rows[0];
  if (!row) throw new DomainError("not_found", 404);
  return row;
}
async function content(input: { format: "score" | "musicxml"; body: string }) {
  if (Buffer.byteLength(input.body) > env.SCORE_MAX_BYTES) throw new DomainError("score_too_large", 413);
  return validateScore(input.body, input.format, true);
}
async function upload(req: { header: (name: string) => string | undefined; text: () => Promise<string> }) {
  const type = req.header("content-type")?.split(";")[0];
  if (type !== "text/xml" && type !== "application/json") throw new DomainError("unsupported_score_type", 415);
  return {format: type === "text/xml" ? "musicxml" as const : "score" as const, schemaVersion: 1 as const, body: await req.text()};
}
async function insertVersion(
  db: PoolClient,
  e: string,
  p: string,
  u: string,
  n: number,
  input: { format: "score" | "musicxml"; schemaVersion: 1 },
  data: Awaited<ReturnType<typeof content>>,
) {
  const v = (
    await db.query(
      "insert into score_versions(ensemble_id,piece_id,version_no,created_by,format,schema_version,musicxml,native_score,content_hash,size,timing) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id",
      [
        e,
        p,
        n,
        u,
        input.format,
        input.schemaVersion,
        input.format === "musicxml" ? data.raw : null,
        input.format === "score" ? data.raw : null,
        data.hash,
        data.size,
        JSON.stringify(data.timing),
      ],
    )
  ).rows[0];
  await db.query(
    "update music_pieces set current_version_id=$1,format=$2 where id=$3",
    [v.id, input.format, p],
  );
}
domain.get("/ensembles/:ensemble/pieces", async (c) => {
  const e = c.req.param("ensemble");
  await authorize(pool, c.get("user").id, e);
  return c.json(
    (
      await pool.query(
        metadataSQL +
          ' where p.ensemble_id=$1 order by p.sort_key collate "C",p.id',
        [e],
      )
    ).rows,
  );
});
domain.get("/ensembles/:ensemble/pieces/:piece", async (c) => {
  const e = c.req.param("ensemble");
  await authorize(pool, c.get("user").id, e);
  return c.json(await metadata(pool, e, c.req.param("piece")));
});
domain.get(
  "/ensembles/:ensemble/pieces/:piece/versions/:version",
  async (c) => {
    const e = c.req.param("ensemble");
    await authorize(pool, c.get("user").id, e);
    const v = (
      await pool.query(
        "select * from score_versions where ensemble_id=$1 and piece_id=$2 and (version_no::text=$3 or content_hash=$3)",
        [e, c.req.param("piece"), c.req.param("version")],
      )
    ).rows[0];
    if (!v) throw new DomainError("not_found", 404);
    if(c.req.query('timing')==='1') {
      let timing=v.timing;
      if(timing?.derivationVersion!==TIMING_DERIVATION_VERSION) {
        timing=(await validateScore(v.format==='musicxml'?v.musicxml:canonicalJSON(v.native_score),v.format,true)).timing;
        await pool.query('update score_versions set timing=$2 where id=$1',[v.id,JSON.stringify(timing)]);
      }
      return c.json({pieceId:v.piece_id,versionNo:v.version_no,contentHash:v.content_hash,timing});
    }
    c.header(
      "Content-Disposition",
      'attachment; filename="score.' +
        (v.format === "musicxml" ? "musicxml" : "json") +
        '"',
    );
    c.header("Content-Security-Policy", "sandbox; default-src 'none'");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("ETag", `"${v.content_hash}"`);
    c.header("Cache-Control", "private, max-age=31536000, immutable");
    if (c.req.header("if-none-match") === `"${v.content_hash}"`)
      return c.body(null, 304);
    return c.body(
      v.format === "musicxml" ? v.musicxml : canonicalJSON(v.native_score),
      200,
      {
        "Content-Type":
          v.format === "musicxml"
            ? "application/octet-stream"
            : "application/json",
      },
    );
  },
);
domain.post("/ensembles/:ensemble/pieces", async (c) => {
  const e = c.req.param("ensemble"), u = c.get("user");
  await authorize(pool, u.id, e, "editPieces");
  const meta = createPieceInput.omit({content:true}).parse({title: scoreTitle(c.req.header("x-score-title") ?? ""), idempotencyKey:c.req.header("idempotency-key")});
  if((meta.title.includes("\0") || !meta.title.isWellFormed())) throw new DomainError("invalid_text",422);
  const input = {...meta, content: await upload(c.req)};
  const data = await content(input.content);
  const result = await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "editPieces");
    const cached = await replay(
      db,
      e,
      u.id,
      "piece",
      input.idempotencyKey,
      {...input,content:{format:input.content.format,hash:data.hash}},
    );
    if (cached) return cached;
    const n = (
      await db.query(
        "select coalesce(max(sort_key::bigint),-1)+1 as n from music_pieces where ensemble_id=$1",
        [e],
      )
    ).rows[0].n;
    const p = (
      await db.query(
        "insert into music_pieces(ensemble_id,title,sort_key,format,idempotency_key) values($1,$2,$3,$4,$5) returning id",
        [
          e,
          input.title,
          String(n).padStart(12, "0"),
          input.content.format,
          null,
        ],
      )
    ).rows[0];
    await insertVersion(db, e, p.id, u.id, 1, input.content, data);
    await audit(db, e, u.id, "piece.create", p.id);
    const response = await metadata(db, e, p.id);
    await remember(db, e, u.id, "piece", input.idempotencyKey, {...input,content:{format:input.content.format,hash:data.hash}}, response);
    return response;
  });
  await libraryChanged(e, [result]);
  return c.json(result, 201);
});
domain.post("/ensembles/:ensemble/pieces/:piece/versions", async (c) => {
  const e = c.req.param("ensemble"), p = c.req.param("piece"), u = c.get("user");
  await authorize(pool, u.id, e, "editPieces");
  const meta = versionInput.omit({content:true}).parse({expectedRevision: Number(c.req.header("x-expected-revision"))});
  const input = {...meta, content:await upload(c.req)};
  const data = await content(input.content);
  const result = await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "editPieces");
    const current = await metadata(db, e, p);
    if (current.revision !== input.expectedRevision)
      throw new DomainError("revision_conflict", 409, current);
    await insertVersion(
      db,
      e,
      p,
      u.id,
      current.versionNo + 1,
      input.content,
      data,
    );
    await audit(db, e, u.id, "piece.version.create", p);
    await db.query("update music_pieces set revision=revision+1 where id=$1", [
      p,
    ]);
    return metadata(db, e, p);
  });
  await libraryChanged(e, [result]);
  return c.json(result);
});
domain.patch("/ensembles/:ensemble/pieces/:piece", async (c) => {
  const input = settingsInput.parse(await readBody(c.req)),
    e = c.req.param("ensemble"),
    p = c.req.param("piece"),
    u = c.get("user");
  const result = await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "editPieces");
    const current = await metadata(db, e, p);
    if (
      (input.op === "replace" && input.expectedRevision === undefined) ||
      (input.expectedRevision !== undefined &&
        current.revision !== input.expectedRevision)
    )
      throw new DomainError("revision_conflict", 409, current);
    if (input.key && input.value !== null) {
      const existing = current.settings;
      const keys = Object.values(existing).flatMap((v) =>
        v && typeof v === "object" ? Object.keys(v) : [],
      );
      if (keys.length >= 1024 && !keys.includes(input.key))
        throw new DomainError("settings_limit", 422);
    }
    const columns = {
      partName: "part_names",
      clef: "clef_overrides",
      removed: "removed_parts",
      split: "split_parts",
      saved: "saved_config",
      defaults: "format_defaults",
    };
    if (input.op === "title") {
      const title = z.string().trim().min(1).max(500).parse(input.value);
      await db.query(
        "update music_pieces set title=$1,revision=revision+1 where id=$2",
        [title, p],
      );
    } else if (input.op === "swing") {
      await db.query(
        "update music_pieces set swing=$1,revision=revision+1 where id=$2",
        [z.boolean().parse(input.value), p],
      );
    } else if (input.op === "replace") {
      const obj = z.record(z.string(), z.json()).parse(input.value);
      await db.query(
        "update music_pieces set saved_config=$1,revision=revision+1 where id=$2",
        [JSON.stringify(obj), p],
      );
    } else {
      if (!input.key) throw new DomainError("invalid_input");
      const column = columns[input.op];
      await db.query(
        input.value === null
          ? `update music_pieces set ${column}=coalesce(${column},'{}'::jsonb)-$1::text,revision=revision+1 where id=$2`
          : `update music_pieces set ${column}=jsonb_set(coalesce(${column},'{}'::jsonb),array[$1::text],$3::jsonb,true),revision=revision+1 where id=$2`,
        input.value === null
          ? [input.key, p]
          : [input.key, p, JSON.stringify(input.value)],
      );
    }
    await audit(db, e, u.id, "piece.metadata." + input.op, p);
    return metadata(db, e, p);
  });
  await libraryChanged(e, [result]);
  return c.json(result);
});
domain.post("/ensembles/:ensemble/reorder", async (c) => {
  const input = reorderInput.parse(await readBody(c.req)),
    e = c.req.param("ensemble"),
    u = c.get("user");
  const results = await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "editPieces");
    const all = (
      await db.query(
        'select id from music_pieces where ensemble_id=$1 order by sort_key collate "C",id',
        [e],
      )
    ).rows.map((r) => r.id);
    if (JSON.stringify(all) !== JSON.stringify(input.expectedOrder))
      throw new DomainError("stale_order", 409, all);
    if (
      new Set(input.pieceIds).size !== all.length ||
      input.pieceIds.length !== all.length ||
      input.pieceIds.some((id) => !all.includes(id))
    )
      throw new DomainError("stale_order", 409, all);
    for (const [n, id] of input.pieceIds.entries())
      await db.query(
        "update music_pieces set sort_key=$1 where id=$2 and ensemble_id=$3",
        [String(n).padStart(12, "0"), id, e],
      );
    await audit(db, e, u.id, "piece.reorder", e);
    return (
      await db.query(
        metadataSQL + " where p.ensemble_id=$1 order by p.sort_key",
        [e],
      )
    ).rows;
  });
  await libraryChanged(e, results);
  return c.json(results);
});
domain.delete("/ensembles/:ensemble/pieces/:piece", async (c) => {
  const e = c.req.param("ensemble"),
    p = c.req.param("piece"),
    u = c.get("user");
  const old = await transaction(async (db) => {
    await lockEnsemble(db, e);
    await authorize(db, u.id, e, "editPieces");
    const old = await metadata(db, e, p);
    await db.query(
      "update music_pieces set current_version_id=null where id=$1",
      [p],
    );
    await db.query(
      "delete from score_versions where piece_id=$1 and ensemble_id=$2",
      [p, e],
    );
    await db.query(
      "update transcription_jobs set imported_piece_id=null where imported_piece_id=$1 and ensemble_id=$2",
      [p, e],
    );
    await db.query("delete from music_pieces where id=$1 and ensemble_id=$2", [
      p,
      e,
    ]);
    await audit(db, e, u.id, "piece.delete", p);
    return old;
  });
  await libraryChanged(e, [
    {
      pieceId: p,
      revision: old.revision + 1,
      versionNo: old.versionNo,
      contentHash: old.contentHash,
      deleted: true,
    },
  ]);
  return c.json({ status: true });
});

registerTranscriptionRoutes(domain);
