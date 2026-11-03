import { env } from './env.server';
export function formatInstant(value: string | Date) {
  if (typeof value === 'string' && !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('An explicit offset is required');
  return new Intl.DateTimeFormat('en-GB', { timeZone: env.APP_TIME_ZONE, dateStyle: 'short', timeStyle: 'long', hourCycle: 'h23' }).format(new Date(value));
}
