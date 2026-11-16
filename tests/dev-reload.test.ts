// @vitest-environment node
import { test, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { startDevelopment } from '../scripts/dev';

test('dev listener survives child reload/crash, waits for readiness and relays upgrades', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lightscore-dev-'));
  const childPath = join(dir, 'child.mjs');
  await writeFile(childPath, `
    import {createServer} from 'node:http';
    const server=createServer((req,res)=>{
      if(req.url==='/restart') {process.send({type:'restart'});return;}
      if(req.url==='/crash') process.exit(1);
      res.end(String(process.pid));
    });
    server.on('upgrade',(req,socket)=>{
      socket.write('HTTP/1.1 101 Switching Protocols\\r\\nConnection: Upgrade\\r\\nUpgrade: test\\r\\n\\r\\n');
      socket.on('data',data=>socket.write(data));
    });
    setTimeout(()=>server.listen(0,'127.0.0.1',()=>process.send({type:'ready',port:server.address().port})),150);
  `);
  const dev = await startDevelopment({ port: 0, childPath });
  try {
    const address = dev.server.address();
    if (!address || typeof address === 'string') throw Error('No listener');
    const origin = `http://127.0.0.1:${address.port}`;
    const read = async () => (await fetch(origin, { signal: AbortSignal.timeout(10000), headers: { Connection: 'close' } })).text();
    let previous = await read();
    for (const trigger of ['restart', 'crash', 'restart']) {
      // Observe the real public listener throughout the child handover. An HTTP
      // health check alone misses the brief missing-listener race in Lizardtail.
      const failures: unknown[] = [];
      const poll = setInterval(() => {
        const socket = connect(address.port, '127.0.0.1');
        socket.on('error', e => failures.push(e));
        socket.on('connect', () => socket.destroy());
      }, 5);
      try {
        await fetch(origin + '/' + trigger, { signal: AbortSignal.timeout(5000) }).catch(() => {});
        const next = await read();
        expect(next).not.toBe(previous);
        previous = next;
        expect(failures).toEqual([]);
        expect(dev.server.address()).toEqual(address);
      } finally { clearInterval(poll); }
    }
    await new Promise<void>((resolve, reject) => {
      const socket = connect(address.port, '127.0.0.1');
      const timeout = setTimeout(() => { socket.destroy(); reject(Error('Upgrade timed out')); }, 3000);
      socket.on('error', reject);
      socket.on('connect', () => socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n'));
      socket.on('data', data => {
        if (data.toString().includes('101 Switching Protocols')) socket.write('echo');
        else {
          expect(data.toString()).toBe('echo');
          clearTimeout(timeout);socket.destroy();resolve();
        }
      });
    });
  } finally {
    await dev.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
