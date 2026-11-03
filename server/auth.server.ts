import { allowAccountMail } from "./auth-guards.server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "./env.server";
import { eq } from "drizzle-orm";
import { db } from "./db/index.server";
import * as schema from "./db/schema.server";
import { logError } from "./logger.server";
import { revoked } from "./revocation.server";
import { trackBackground } from "./background.server";
import { accountMail, mailer } from "./mail.server";
function makeAuth() {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: env.TRUSTED_ORIGINS,
    verification: { storeIdentifier: "hashed" },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 60 },
        "/sign-up/email": { window: 60, max: 60 },
        "/request-password-reset": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      session: {
        delete: {
          after: async (session) => {
            revoked(session.token);
          },
        },
      },
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, email: user.email.trim().toLowerCase() },
          }),
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      onExistingUserSignUp: async ({ user }) => {
        await auth.api.requestPasswordReset({
          body: { email: user.email, redirectTo: `${env.BETTER_AUTH_URL}/` },
        });
      },
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        await db
          .update(schema.user)
          .set({ emailVerified: true })
          .where(eq(schema.user.id, user.id));
      },
      sendResetPassword: async ({ user, url }) =>
        (await allowAccountMail(user.email)) ? mailer.send(
          accountMail(user.email, url, await userLanguage(user.id), "reset"),
        ) : undefined,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) =>
        (await allowAccountMail(user.email)) ? mailer.send(
          accountMail(user.email, url, await userLanguage(user.id), "verify"),
        ) : undefined,
    },
    user: {
      additionalFields: {
        language: {
          type: ["en", "de"],
          required: false,
          defaultValue: "en",
          input: true,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      disableOriginCheck: false,
      ipAddress: { ipAddressHeaders: ["x-lightscore-socket-ip"] },
      backgroundTasks: { handler: trackBackground },
      useSecureCookies: env.NODE_ENV === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
      },
    },
    onAPIError: {
      onError: (error) => {
        logError("auth.api", error);
      },
    },
    logger: { level: "error", log: () => logError("auth.error") },
  });
}
const key = Symbol.for("lightscore.auth");
const globals = globalThis as typeof globalThis & {
  [key]?: ReturnType<typeof makeAuth>;
};
export const auth = (globals[key] ??= makeAuth());
export async function currentSession(headers: Headers) {
  return auth.api.getSession({ headers, query: { disableCookieCache: true } });
}

async function userLanguage(id: string) {
  const rows = await db
    .select({ language: schema.user.language })
    .from(schema.user)
    .where(eq(schema.user.id, id));
  return rows[0]?.language ?? "en";
}
