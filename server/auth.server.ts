import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { env } from './env.server';
import { eq } from 'drizzle-orm';
import { db } from './db/index.server';
import * as schema from './db/schema.server';
import { accountMail, mailer } from './mail.server';
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL, trustedOrigins: env.TRUSTED_ORIGINS,
  emailAndPassword: { enabled: true, requireEmailVerification: true, revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => mailer.send(accountMail(user.email, url, await userLanguage(user.id), 'reset')),
  },
  emailVerification: { sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => mailer.send(accountMail(user.email, url, await userLanguage(user.id), 'verify')),
  },
  user: { additionalFields: { language: { type: ['en', 'de'], required: false, defaultValue: 'en', input: true } } },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
  advanced: { useSecureCookies: env.NODE_ENV === 'production', defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production' } },
  logger: { disabled: true },
});
export async function currentSession(headers: Headers) {
  return auth.api.getSession({ headers, query: { disableCookieCache: true } });
}

async function userLanguage(id: string) { const rows = await db.select({ language: schema.user.language }).from(schema.user).where(eq(schema.user.id, id)); return rows[0]?.language ?? 'en'; }
