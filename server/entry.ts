// A built server defaults to production safeguards; local harnesses explicitly use NODE_ENV=test.
process.env.NODE_ENV ??= 'production';
await import('./start');
