// A built server defaults to production safeguards; local harnesses explicitly use NODE_ENV=test.
process.env.NODE_ENV ??= 'production';
process.env.LIGHTSCORE_PROCESS_ROLE = 'web';
await import('./start');
