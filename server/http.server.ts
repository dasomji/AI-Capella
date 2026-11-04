import { admin } from './admin.server';
import { adminSession,isSysadmin } from './admin-auth.server';
import { sandboxReady } from './sandbox.server';
void sandboxReady();
import { rehearsalReady } from './rehearsal.server';
import { withMailRequester } from "./auth-guards.server";
import { jwtVerify } from "jose";
import { verifyPassword } from "better-auth/crypto";
import { transaction } from "./domain.server";
import { authorize } from "./domain.server";
import { bodyLimit } from "hono/body-limit";
import { domain } from "./domain-http.server";
import { createHash } from "node:crypto";
import { revoked } from "./revocation.server";
import { Hono } from "hono";
import { auth, currentSession } from "./auth.server";
import { pool } from "./db/index.server";
import { env } from "./env.server";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { logError, withRequestLog } from "./logger.server";
import { uploadAdmission as uploadSlots } from "./upload-admission.server";
export const api = new Hono();
api.onError((error, c) => {
  logError("http.error", error, c.res.headers.get("x-request-id") ?? undefined);
  return Response.json(
    { error: "Service unavailable. Please try again." },
    { status: 500 },
  );
});
api.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.header("X-Request-ID", requestId);
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  if (env.NODE_ENV === "production")
    c.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  {
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; form-action 'self'; media-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
  }
  // Conceal the administration surface before origin/body validation, including encoded/unknown paths.
  let accessPath=c.req.path;try {accessPath=decodeURIComponent(accessPath).trim();}catch {/* Normal route validation owns malformed encodings. */}
  if (/^\/(?:api\/admin|admin)(?:\s*\/|$)/i.test(accessPath) && !await adminSession(c.req.raw.headers)) {
    c.header("Cache-Control", "no-store");
    return c.req.path.startsWith("/api/") ? c.json({code:"not_found"},404) : c.html('<main><h1>404</h1><p>Not found</p></main>',404);
  }
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    !env.TRUSTED_ORIGINS.includes(c.req.header("origin") ?? "")
  )
    return c.json({ error: "Untrusted origin" }, 403);
  if (c.req.path.startsWith("/assets/"))
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  else if (
    /^\/(?:api(?:\/|$)|healthz$|readyz(?:\/rehearsal)?$|app$|_serverFn(?:\/|$))/.test(
      c.req.path,
    ) ||
    c.req.path === "/"
  )
    c.header("Cache-Control", "no-store");
  await next();
  if (c.res.headers.get("Content-Type")?.includes("text/html"))
    c.header("Cache-Control", "no-store");
});
api.use("/api/*", async (c, next) => {
  // Originals own their streaming limit and inspection semaphore, never bodyLimit buffering.
  if(c.req.method==='POST' && /^\/api\/ensembles\/[^/]+\/originals$/.test(c.req.path)) return next();
  const scorePath = c.req.path.match(/^\/api\/ensembles\/([^/]+)\/pieces(?:\/[^/]+\/versions)?$/);
  let release: (() => void) | undefined;
  if(c.req.method === "POST" && scorePath) {
    const session = await currentSession(c.req.raw.headers);
    // Consume rejected bodies without retaining them. Leaving an HTTP/1 upload half-read
    // lets the adapter's delayed cleanup close a socket already reused by the browser.
    const discard = async () => {
      const reader = c.req.raw.body?.getReader();
      if (!reader) return;
      const deadline = setTimeout(() => { void reader.cancel().catch(() => {}); }, 2000);
      let size = 0;
      try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > env.SCORE_MAX_BYTES) { await reader.cancel(); break; } } }
      finally {clearTimeout(deadline);reader.releaseLock();}
    };
    if(!session?.user.emailVerified) {await discard();return c.json({code:"SESSION_EXPIRED"},401);}
    try {await authorize(pool,session.user.id,scorePath[1],"editPieces");}
    catch {await discard();return c.json({code:"forbidden"},403);}
    const slot = uploadSlots.take(session.user.id);
    if ("code" in slot) {
      c.header("Retry-After", "2");
      await discard();
      return c.json({code:"upload_busy"},slot.code);
    }
    release = slot.release;
  }
  try { return await bodyLimit({
    maxSize:
      c.req.method === "POST" &&
      /^\/api\/ensembles\/[^/]+\/pieces(?:\/[^/]+\/versions)?$/.test(c.req.path)
        ? env.SCORE_MAX_BYTES
        : 16384,
    onError: (c) => c.json({ code: "body_too_large" }, 413),
  })(c, next); } finally { release?.(); }
});
api.get("/healthz", (c) => c.json({ status: "ok" }));
api.get("/readyz/rehearsal", (c) => rehearsalReady() ? c.json({status:"ready"}) : c.json({status:"rehearsal unavailable"},503));
api.get("/readyz", async (c) => {
  try {
    const expected = readMigrationFiles({ migrationsFolder: "./drizzle" });
    const query = {
      text: "select hash from drizzle.__drizzle_migrations order by created_at",
      query_timeout: 2000,
    };
    const result = await pool.query(query);
    if (
      result.rows.length < expected.length ||
      expected.some((m, i) => m.hash !== result.rows[i]?.hash)
    )
      return c.json({ status: "migrations pending" }, 503);
    if(!await sandboxReady())return c.json({status:'sandbox_unavailable',uploads:false,transcription:false},503);
    return c.json({ status: "ready", rehearsal: rehearsalReady() });
  } catch (error) {
    logError("database.readiness", error);
    return c.json({ status: "not ready" }, 503);
  }
});
// The public shell checks identity and purges private storage before redirecting.
// One process initially: reject overlapping password evaluations, never queue guesses.
const passwordChecks = new Set<string>();
const failedPasswordChecks = new Map<string, number>();
api.use("/api/auth/*", async (c, next) => {
  if (c.req.method !== "POST" || !/\/sign-in\/email\/*$/.test(decodeURIComponent(c.req.path))) return next();
  const body = await c.req.raw.clone().json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const digest = createHash("sha256").update(email).digest("hex");
  const ip = c.req.header("x-lightscore-socket-ip") ?? "";
  const key = digest + ":" + ip;
  if (passwordChecks.has(key)) {
    c.header("Retry-After", "1");
    return c.json({code:"TOO_MANY_ATTEMPTS"},429);
  }
  passwordChecks.add(key);
  let counted = false;
  try {
    const failureKey = "email:" + digest + ":/api/auth/sign-in/email:" + ip;
    const failure = (await pool.query("select count,last_request from rate_limit where key=$1",[failureKey])).rows[0];
    if (failure?.count > 0 && Number(failure.last_request) > Date.now()-60000) {
      const count = failedPasswordChecks.get(digest) ?? 0;
      if (count >= 4) { c.header("Retry-After","1"); return c.json({code:"TOO_MANY_ATTEMPTS"},429); }
      failedPasswordChecks.set(digest,count+1); counted=true;
    }
    await next();
  } finally {
    passwordChecks.delete(key);
    if(counted) { const count=failedPasswordChecks.get(digest)!-1; if(count) failedPasswordChecks.set(digest,count); else failedPasswordChecks.delete(digest); }
  }
});
api.on(["GET", "POST"], "/api/auth/*", async (c) => {
  const path = decodeURIComponent(c.req.path).replace(/\/+$/, "");
  if (!c.req.header("x-lightscore-socket-ip"))
    return c.json({ code: "client_ip_unavailable" }, 503);
  if (path.endsWith("/list-sessions") || path.endsWith("/revoke-session")) {
    const session = await currentSession(c.req.raw.headers);
    if (!session) return c.json({ code: "SESSION_EXPIRED" }, 401);
    if (c.req.method === "GET" && path.endsWith("/list-sessions")) {
      const rows = await pool.query(
        'select id, user_agent as "userAgent", created_at as "createdAt", expires_at as "expiresAt" from session where user_id=$1 and expires_at>now()',
        [session.user.id],
      );
      return c.json(
        rows.rows.map((row) => ({
          ...row,
          current: row.id === session.session.id,
        })),
      );
    }
    const body = await c.req.json();
    const rows = await pool.query(
      "delete from session where id=$1 and user_id=$2 returning token",
      [body.id, session.user.id],
    );
    for (const row of rows.rows) revoked(row.token);
    return c.json({ status: true });
  }
  if(path.endsWith("/verify-email") && c.req.method === "GET") {
    const target = new URL("/",env.BETTER_AUTH_URL);
    target.searchParams.set("verify",c.req.query("token") ?? "");
    const callback = c.req.query("callbackURL");
    if(callback) {try {const url=new URL(callback,env.BETTER_AUTH_URL);if(url.origin===new URL(env.BETTER_AUTH_URL).origin && url.pathname.startsWith("/invite/")) target.searchParams.set("invite",url.pathname.slice(8));} catch {}}
    return c.redirect(target.toString());
  }
  if(path.endsWith("/verify-email-password") && c.req.method === "POST") {
    const body = await c.req.json();
    try {
      if(typeof body.token!=="string" || typeof body.password!=="string" || body.password.length>128) return c.json({code:"INVALID_INPUT"},422);
      const {payload}=await jwtVerify(body.token,new TextEncoder().encode(env.BETTER_AUTH_SECRET),{algorithms:["HS256"]});
      if(typeof payload.email!=="string" || payload.updateTo) return c.json({code:"INVALID_TOKEN"},400);
      const tokens = await transaction(async db=>{
        const user=(await db.query('select id from "user" where email=$1 for update',[payload.email])).rows[0];
        if(!user) throw Error("invalid");
        const key="verify-password:"+user.id+":"+c.req.header("x-lightscore-socket-ip");
        const failure=(await db.query('select count,last_request from rate_limit where key=$1',[key])).rows[0];
        if(failure && failure.count>=5 && Number(failure.last_request)>Date.now()-900000) return null;
        const credential=(await db.query("select password from account where user_id=$1 and provider_id='credential'",[user.id])).rows[0];
        if(!credential || !(await verifyPassword({hash:credential.password,password:body.password}))) {
          await db.query(`insert into rate_limit(key,count,last_request) values($1,1,$2) on conflict(key) do update set count=case when rate_limit.last_request<$2-900000 then 1 else rate_limit.count+1 end,last_request=case when rate_limit.last_request<$2-900000 then $2 else rate_limit.last_request end`,[key,Date.now()]);return null;
        }
        await db.query('update "user" set email_verified=true where id=$1',[user.id]);
        return (await db.query('delete from session where user_id=$1 returning token',[user.id])).rows;
      });
      if(!tokens) return c.json({code:"INVALID_PASSWORD"},401);
      for(const row of tokens) revoked(row.token);
      return c.json({status:true});
    } catch {return c.json({code:"INVALID_TOKEN"},400);}
  }
  let emailFailureKey: string | undefined;
  let globalFailureKey: string | undefined;
  if (c.req.method === "POST" && /\/(sign-in|sign-up)\/email$/.test(path)) {
    const body = await c.req.raw.clone().json();
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const emailKey =
      "email:" + createHash("sha256").update(email).digest("hex") + ":" + path;
    const ip = c.req.header("x-lightscore-socket-ip") ?? "";
    const group = ip; // Node boundary already groups IPv6 clients by /64.
    const now = Date.now();
    if (path.endsWith("/sign-in/email")) {
      emailFailureKey = emailKey + ":" + group;
      globalFailureKey = emailKey;
      const globalFailures = (await pool.query("select count,last_request from rate_limit where key=$1",[emailKey])).rows[0];
      if(globalFailures && Number(globalFailures.last_request)>now-60000) await new Promise(resolve=>setTimeout(resolve,Math.min(1000,Math.max(0,globalFailures.count-10)*10)));
      const failures = (
        await pool.query(
          "select count,last_request from rate_limit where key=$1",
          [emailFailureKey],
        )
      ).rows[0];
      if (
        failures &&
        failures.count >= 10 &&
        Number(failures.last_request) > now - 60000
      )
        return c.json({ code: "TOO_MANY_ATTEMPTS" }, 429);
    }
    for (const [key, max] of (path.endsWith("/sign-up/email") ? [[emailKey, 100] as const] : [])) {
      const result = await pool.query(
        `insert into rate_limit(key,count,last_request) values ($1,1,$2) on conflict(key) do update set count=case when rate_limit.last_request < $2-60000 then 1 else rate_limit.count+1 end, last_request=case when rate_limit.last_request < $2-60000 then $2 else rate_limit.last_request end returning count`,
        [key, now],
      );
      if (result.rows[0].count > max)
        return c.json({ code: "TOO_MANY_ATTEMPTS" }, 429);
    }
  }
  const response = await withRequestLog(
    c.res.headers.get("x-request-id") ?? crypto.randomUUID(),
    () => withMailRequester(c.req.header("x-lightscore-socket-ip") ?? "internal", () => auth.handler(c.req.raw)),
  );
  const responseHeaders=new Headers(response.headers);
  if(path.endsWith('/sign-out'))responseHeaders.set('Clear-Site-Data','"cache"');
  if (emailFailureKey && response.status === 401)
    for(const key of [emailFailureKey, globalFailureKey!]) await pool.query(
      `insert into rate_limit(key,count,last_request) values($1,1,$2) on conflict(key) do update set count=case when rate_limit.last_request < $2-60000 then 1 else rate_limit.count+1 end,last_request=case when rate_limit.last_request < $2-60000 then $2 else rate_limit.last_request end`,
      [key, Date.now()],
    );
  if (response.ok && path.endsWith("/sign-up/email"))
    return c.json({ status: true });
  if (
    response.ok &&
    response.headers.get("content-type")?.includes("application/json")
  ) {
    const data = await response.json();
    if (data?.session) delete data.session.token;
    if (data) delete data.token;
    return Response.json(data, {
      status: response.status,
      headers: responseHeaders,
    });
  }
  if (response.status >= 500)
    logError(
      "auth.http_failure",
      undefined,
      c.res.headers.get("x-request-id") ?? undefined,
    );
  return response.status >= 500
    ? c.json({ error: "Service unavailable. Please try again." }, 503)
    : new Response(response.body,{status:response.status,headers:responseHeaders});
});
api.get("/api/me", async (c) => {
  const session = await currentSession(c.req.raw.headers);
  if (!session || !session.user.emailVerified)
    return c.json({ error: "Sign in again", code: "SESSION_EXPIRED" }, 401);
  return c.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      sysadmin: await isSysadmin(session.user.id),
    },
  });
});

api.route("/api/admin", admin);
api.all("/api/admin/*", c=>c.json({code:"not_found"},404));
api.route("/api", domain);
