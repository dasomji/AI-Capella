import { BlockList, isIP } from "node:net";
import { z } from "zod";
export function parseEnv(input: NodeJS.ProcessEnv) {
  if (
    !["development", "test"].includes(input.NODE_ENV ?? "") &&
    Object.entries(input).some(
      ([key, value]) =>
        /(?:BYPASS|SKIP_AUTH|DISABLE_AUTH)/i.test(key) &&
        value &&
        value !== "false" &&
        value !== "0",
    )
  ) {
    throw new Error("Authentication bypass flags are forbidden in production");
  }
  const schema = z.object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("production"),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    TRUSTED_ORIGINS: z
      .string()
      .min(1)
      .transform((v) =>
        v.split(",").map((o) => new URL(z.url().parse(o.trim())).origin),
      ),
    MAIL_TRANSPORT: z.enum(["smtp", "capture", "resend"]).default("smtp"),
    SMTP_URL: z.string().default("smtp://127.0.0.1:21025"),
    RESEND_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().default("LightScore <noreply@localhost.test>"),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    TRANSCRIPTION_PDF_MAX_BYTES: z.coerce.number().int().positive().default(50*1024*1024),
    TRANSCRIPTION_PHOTO_MAX_BYTES: z.coerce.number().int().positive().default(20*1024*1024),
    TRANSCRIPTION_MAX_PAGES: z.coerce.number().int().positive().max(60).default(60),
    TRANSCRIPTION_MAX_PIXELS: z.coerce.number().int().positive().default(40000000),
    TRANSCRIPTION_USER_MAX: z.coerce.number().int().positive().default(2),
    TRANSCRIPTION_ENSEMBLE_MAX: z.coerce.number().int().positive().default(4),
    TRANSCRIPTION_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
    TRANSCRIPTION_LEASE_MS: z.coerce.number().int().min(1000).default(30000),
    TRANSCRIPTION_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
    TRANSCRIPTION_MAX_ATTEMPTS: z.coerce.number().int().positive().max(10).default(3),
    TRANSCRIPTION_EMERGENCY_STOP: z.enum(['0','1']).default('0'),
    TRANSCRIPTION_PRICE_TABLE: z.string().default('{}').refine(value=>{try{return z.record(z.string(),z.object({input:z.number().nonnegative().finite(),output:z.number().nonnegative().finite()}).strict()).safeParse(JSON.parse(value)).success;}catch{return false;}}),
    OPENAI_API_KEY: z.string().optional(),
    APP_TIME_ZONE: z
      .string()
      .default("UTC")
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
    AUTH_IP_HEADERS: z.string().default(""),
    AUTH_TRUSTED_PROXIES: z.string().default(""),
    SCORE_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(20 * 1024 * 1024),
    SCORE_UPLOAD_GLOBAL_MAX: z.coerce.number().int().positive().default(4),
    SCORE_UPLOAD_USER_MAX: z.coerce.number().int().positive().default(1),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    INVITE_ENSEMBLE_DAILY_MAX: z.coerce.number().int().positive().default(50),
    INVITE_USER_DAILY_MAX: z.coerce.number().int().positive().default(100),
    ENSEMBLE_USER_DAILY_MAX: z.coerce.number().int().positive().default(10),
    DOMAIN_USER_MINUTE_MAX: z.coerce.number().int().positive().default(120),
    PLAYBACK_IDLE_MS: z.coerce.number().int().min(1000).max(86400000).default(600000),
    PLAYBACK_LEAD_MS: z.coerce.number().int().min(0).max(5000).default(400),
    PORT: z.coerce.number().default(3000),
  });
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid server configuration: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const env = result.data;
  if (
    env.NODE_ENV === "production" &&
    /replace-with|change-me/i.test(env.BETTER_AUTH_SECRET)
  )
    throw new Error("Production requires a generated authentication secret");
  if (
    env.NODE_ENV === "production" &&
    (env.MAIL_TRANSPORT !== "resend" ||
      !env.RESEND_API_KEY ||
      !env.BETTER_AUTH_URL.startsWith("https://") ||
      env.TRUSTED_ORIGINS.some((o) => !o.startsWith("https://")))
  )
    throw new Error("Production requires HTTPS and Resend configuration");
  if (
    env.NODE_ENV === "test" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(env.BETTER_AUTH_URL).hostname,
    )
  )
    throw new Error("Test auth URL must be loopback");
  if (
    env.NODE_ENV === "production" &&
    Boolean(env.AUTH_IP_HEADERS.trim()) !==
      Boolean(env.AUTH_TRUSTED_PROXIES.trim())
  )
    throw new Error(
      "Proxy IP headers and trusted proxies must be configured together",
    );
  for (const value of env.AUTH_TRUSTED_PROXIES.split(",").filter(Boolean)) {
    const [network, prefix] = value.trim().split("/");
    if (!isIP(network)) throw new Error("Invalid trusted proxy address");
    const list = new BlockList();
    if (prefix)
      list.addSubnet(
        network,
        Number(prefix),
        isIP(network) === 6 ? "ipv6" : "ipv4",
      );
  }
  if (
    env.AUTH_IP_HEADERS.split(",").some(
      (h) => h && !/^[a-z0-9-]+$/i.test(h.trim()),
    )
  )
    throw new Error("Invalid IP header");
  return env;
}
export const env = parseEnv(process.env);
