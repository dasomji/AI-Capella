import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

if (process.env.NODE_ENV !== 'development' || process.env.LIZARDTAIL_MANAGED !== '1')
  throw Error('Mail preview requires managed development mode');
const socket = process.env.SMTP_SOCKET_PATH;
if (!socket || !process.env.PORT) throw Error('Missing mail socket or UI port');
mkdirSync(dirname(socket), { recursive: true, mode: 0o700 });
// Native Mailpit v1.27, extracted from the pinned compose image on this host.
// No relay, forwarding or version-check network requests.
const child = spawn('mailpit', [
  '--listen', `127.0.0.1:${process.env.PORT}`, '--smtp', `unix:${socket}:600`,
  '--database', join(dirname(socket), 'mail.sqlite'), '--disable-version-check',
  '--smtp-disable-rdns', '--block-remote-css-and-fonts',
], { stdio: 'inherit' });
child.on('error', () => { console.error('Install Mailpit v1.27 on the development host PATH'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
