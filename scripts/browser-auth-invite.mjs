// Existing real-server journeys: signup/mail verification, reset, account sheet,
// invitation acceptance, wrong-account handling and revoked invitations.
await import('./browser-smoke.mjs');
if (process.exitCode) throw Error('Authentication browser smoke failed');
await import('./browser-phase2b.mjs');
