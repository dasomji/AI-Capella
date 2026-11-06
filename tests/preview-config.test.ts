// @vitest-environment node
import { test, expect, vi } from 'vitest';
import { assertDevSeedDatabase } from '../scripts/dev-seed-guard';

test('dev seeding refuses production, unknown modes and remote/overridden database hosts', () => {
  const local = 'postgresql://dev:local@127.0.0.1:5432/app';
  for (const NODE_ENV of ['production', '', undefined])
    expect(() => assertDevSeedDatabase({ NODE_ENV, DATABASE_URL: local })).toThrow();
  for (const DATABASE_URL of ['', 'invalid-url', 'postgres://remote.example/app', 'sqlite:///tmp/db',
    local + '?host=remote.example', local + '?hostaddr=203.0.113.1'])
    expect(() => assertDevSeedDatabase({ NODE_ENV: 'development', DATABASE_URL })).toThrow();
  for (const host of ['127.0.0.1', 'localhost', '[::1]'])
    expect(() => assertDevSeedDatabase({ NODE_ENV: 'development', DATABASE_URL: `postgres://${host}/app` })).not.toThrow();
});

test('preview configuration permits an explicit fake provider but production refuses it', async () => {
  const input = { NODE_ENV: 'development', DATABASE_URL: 'postgres://127.0.0.1/app',
    BETTER_AUTH_URL: 'https://preview.example.test', TRUSTED_ORIGINS: 'https://preview.example.test',
    BETTER_AUTH_SECRET: 'unit-fixture-value-of-at-least-32-characters',
    TRANSCRIPTION_PROVIDER: 'fake', S3_ENDPOINT: 'http://127.0.0.1:8333',
    S3_PUBLIC_ENDPOINT: 'https://storage.example.test', S3_ACCESS_KEY_ID: 'fixture',
    S3_SECRET_ACCESS_KEY: 'fixture', S3_BUCKET: 'assets' };
  for (const [key, value] of Object.entries(input)) vi.stubEnv(key, value);
  try {
    const { parseEnv } = await import('../server/env.server');
    expect(parseEnv(input).TRANSCRIPTION_PROVIDER).toBe('fake');
    expect(() => parseEnv({ ...input, NODE_ENV: 'production' })).toThrow(/forbidden/);
    expect(() => parseEnv({ ...input, NODE_ENV: 'production', TRANSCRIPTION_PROVIDER: 'openai', SMTP_SOCKET_PATH: '/tmp/smtp.sock' })).toThrow(/forbidden/);
    const { S3Storage } = await import('../server/storage.server');
    const signed = new URL(await new S3Storage().signedGet('originals/test.pdf'));
    expect(signed.origin).toBe(input.S3_PUBLIC_ENDPOINT);
    expect(signed.pathname).toBe('/assets/originals/test.pdf');
    expect(signed.searchParams.has('X-Amz-Signature')).toBe(true);
  } finally { vi.unstubAllEnvs(); }
});
