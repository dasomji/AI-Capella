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
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    !env.TRUSTED_ORIGINS.includes(c.req.header("origin") ?? "")
  )
    return c.json({ error: "Untrusted origin" }, 403);
  if (c.req.path.startsWith("/assets/"))
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  else if (
    /^\/(?:api(?:\/|$)|healthz$|readyz$|app$|_serverFn(?:\/|$))/.test(
      c.req.path,
    ) ||
    c.req.path === "/"
  )
    c.header("Cache-Control", "no-store");
  await next();
  if (c.res.headers.get("Content-Type")?.includes("text/html"))
    c.header("Cache-Control", "no-store");
});
api.use("/api/*", async (c, next) =>
  bodyLimit({
    maxSize:
      c.req.method === "POST" &&
      /^\/api\/ensembles\/[^/]+\/pieces(?:\/[^/]+\/versions)?$/.test(c.req.path)
        ? env.SCORE_MAX_BYTES + 65536
        : 16384,
    onError: (c) => c.json({ code: "body_too_large" }, 413),
  })(c, next),
);
api.get("/healthz", (c) => c.json({ status: "ok" }));
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
    return c.json({ status: "ready" });
  } catch (error) {
    logError("database.readiness", error);
    return c.json({ status: "not ready" }, 503);
  }
});
api.use("/app", async (c, next) => {
  const session = await currentSession(c.req.raw.headers);
  if (!session?.user.emailVerified) return c.redirect("/?state=expired");
  await next();
});
api.on(["GET", "POST"], "/api/auth/*", async (c) => {
  const path = c.req.path;
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
  let emailFailureKey: string | undefined;
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
    for (const [key, max] of [[emailKey, 100]] as const) {
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
    () => auth.handler(c.req.raw),
  );
  if (emailFailureKey && response.status === 401)
    await pool.query(
      `insert into rate_limit(key,count,last_request) values($1,1,$2) on conflict(key) do update set count=case when rate_limit.last_request < $2-60000 then 1 else rate_limit.count+1 end,last_request=case when rate_limit.last_request < $2-60000 then $2 else rate_limit.last_request end`,
      [emailFailureKey, Date.now()],
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
      headers: response.headers,
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
    : response;
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
    },
  });
});

api.route("/api", domain);
