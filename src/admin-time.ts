/** One formatter for admin instants, using the configured zone supplied by the server. */
export function adminInstant(value: string, zone: string, locale = 'en') {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || !/(Z|[+-]\d{2}:\d{2})$/.test(value))
        throw Error('Expected instant with offset');
    return new Intl.DateTimeFormat(locale, { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset', hourCycle: 'h23' }).format(date).replace(/\bGMT\b(?![+-])/, 'GMT+00:00');
}
