export function assertDevSeedDatabase(input: NodeJS.ProcessEnv) {
  if (!['development', 'test'].includes(input.NODE_ENV ?? ''))
    throw Error('seed:dev requires NODE_ENV=development or test');
  let url: URL;
  try { url = new URL(input.DATABASE_URL ?? ''); }
  catch { throw Error('seed:dev requires a valid loopback PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.searchParams.has('host') || url.searchParams.has('hostaddr'))
    throw Error('seed:dev requires a loopback PostgreSQL database (including Lizardtail)');
}
