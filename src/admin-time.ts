/** Central instant formatter: user language, configured business zone. */
export function adminInstant(value: string, zone: string, locale = 'en') {
 const date=new Date(value);
 if(!Number.isFinite(date.getTime())||!/(Z|[+-]\d{2}:\d{2})$/.test(value))throw Error('Expected instant with offset');
 const parts=new Intl.DateTimeFormat(locale==='de'?'de-DE':'en-GB',{timeZone:zone,year:'numeric',month:locale==='de'?'2-digit':'short',day:locale==='de'?'2-digit':'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).formatToParts(date);
 const p=(k:string)=>parts.find(v=>v.type===k)!.value;
 return `${locale==='de'?`${p('day')}.${p('month')}.${p('year')}`:`${p('day')} ${p('month')} ${p('year')}`}, ${p('hour')}:${p('minute')} ${p('timeZoneName').replace('GMT','UTC')}`;
}
export function calendarDate(now:Date,zone:string){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function addCalendarDays(day:string,days:number){const [y,m,d]=day.split('-').map(Number);const date=new Date(Date.UTC(y,m-1,d+days));return date.toISOString().slice(0,10);}
/** Find first instant of a calendar day. Binary search handles DST, including midnight gaps. */
export function calendarInstant(day:string,zone:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Expected calendar date');
 const [y,m,d]=day.split('-').map(Number),anchor=Date.UTC(y,m-1,d);
 if(new Date(anchor).toISOString().slice(0,10)!==day)throw Error('Invalid calendar date');
 let lo=anchor-36*3600000,hi=anchor+36*3600000;
 while(lo<hi){const mid=Math.floor((lo+hi)/2);if(calendarDate(new Date(mid),zone)<day)lo=mid+1;else hi=mid;}
 return new Date(lo).toISOString();
}
export function calendarRange(zone:string,days=7,now=new Date()){const to=addCalendarDays(calendarDate(now,zone),1);return {from:addCalendarDays(to,-days),to};}
