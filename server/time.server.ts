import { env } from './env.server';
export function formatInstant(value: string | Date) {
  if (typeof value === 'string' && !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('An explicit offset is required');
  return new Intl.DateTimeFormat('en-GB', { timeZone: env.APP_TIME_ZONE, dateStyle: 'short', timeStyle: 'long', hourCycle: 'h23' }).format(new Date(value));
}
/** ISO text boundary in the configured business zone, independent of process TZ. */
export function offsetInstant(value:Date){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:env.APP_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).formatToParts(value);
 const part=(kind:string)=>parts.find(p=>p.type===kind)!.value;
 const offset=part('timeZoneName').replace('GMT','')||'+00:00';
 return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}.${String(value.getUTCMilliseconds()).padStart(3,'0')}${offset}`;
}
