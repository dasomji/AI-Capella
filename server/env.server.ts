import { z } from 'zod';
export function parseEnv(input: NodeJS.ProcessEnv) {
  if (!['development', 'test'].includes(input.NODE_ENV ?? '') && Object.entries(input).some(([key, value]) => /(?:BYPASS|SKIP_AUTH|DISABLE_AUTH)/i.test(key) && value && value !== 'false' && value !== '0')) {
    throw new Error('Authentication bypass flags are forbidden in production');
  }
  const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
    DATABASE_URL: z.url(), BETTER_AUTH_SECRET: z.string().min(32), BETTER_AUTH_URL: z.url(),
    TRUSTED_ORIGINS: z.string().min(1).transform(v => v.split(',').map(o => new URL(z.url().parse(o.trim())).origin)),
    MAIL_TRANSPORT: z.enum(['smtp', 'capture', 'resend']).default('smtp'),
    SMTP_URL: z.string().default('smtp://127.0.0.1:21025'),
    RESEND_API_KEY: z.string().optional(), MAIL_FROM: z.string().default('LightScore <noreply@localhost.test>'),
    S3_ENDPOINT: z.string().optional(), S3_REGION: z.string().default('us-east-1'), S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(), S3_SECRET_ACCESS_KEY: z.string().optional(), OPENAI_API_KEY: z.string().optional(),
    APP_TIME_ZONE: z.string().default('UTC').refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }),
    AUTH_IP_HEADERS: z.string().default(''), AUTH_TRUSTED_PROXIES: z.string().default(''),
    PORT: z.coerce.number().default(3000),
  });
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(`Invalid server configuration: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const env = result.data;
  if (env.NODE_ENV === 'production' && /replace-with|change-me/i.test(env.BETTER_AUTH_SECRET)) throw new Error('Production requires a generated authentication secret');
  if (env.NODE_ENV === 'production' && (env.MAIL_TRANSPORT !== 'resend' || !env.RESEND_API_KEY || !env.BETTER_AUTH_URL.startsWith('https://') || env.TRUSTED_ORIGINS.some(o => !o.startsWith('https://')))) throw new Error('Production requires HTTPS and Resend configuration');
  if (env.NODE_ENV === 'test' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.BETTER_AUTH_URL).hostname)) throw new Error('Test auth URL must be loopback');
  if (env.NODE_ENV === 'production' && Boolean(env.AUTH_IP_HEADERS.trim()) !== Boolean(env.AUTH_TRUSTED_PROXIES.trim())) throw new Error('Proxy IP headers and trusted proxies must be configured together');
  return env;
}
export const env = parseEnv(process.env);
