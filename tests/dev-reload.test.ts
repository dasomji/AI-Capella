// @vitest-environment node
import { test, expect, onTestFinished } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { startDevelopment } from '../scripts/dev';

const acceptanceImport = `import {acknowledgeDevelopmentConnections} from ${JSON.stringify(new URL('../scripts/dev-connections.ts', import.meta.url).href)};`;

test('dev listener survives child reload/crash, waits for readiness and relays upgrades', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lightscore-dev-'));
  const childPath = join(dir, 'child.mjs');
  await writeFile(childPath, `${acceptanceImport}
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
    acknowledgeDevelopmentConnections(server);
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

// Use real child processes and ephemeral ports: the public TCP listener must
// retain requests even when its last ready child's port has stopped accepting.
async function fixture(source: string, readinessTimeoutMs = 15000) {
  const dir = await mkdtemp(join(tmpdir(), 'lightscore-dev-'));
  const childPath = join(dir, 'child.mjs');
  await writeFile(childPath, acceptanceImport + '\n' + source);
  const dev = await startDevelopment({ port: 0, childPath, readinessTimeoutMs });
  onTestFinished(async () => {
    await dev.close();
    await rm(dir, { recursive: true, force: true });
  });
  const address = dev.server.address();
  if (!address || typeof address === 'string') throw Error('No listener');
  return `http://127.0.0.1:${address.port}`;
}

test('holds concurrent requests when a ready child loses its listener before exiting', async () => {
  const origin = await fixture(`
    import {createServer} from 'node:http';
    // Model the interval between Vite closing its listener and process exit.
    // Keep the process alive so recovery cannot depend on a lucky exit event.
    setInterval(()=>{},1000);
    const server=createServer((req,res)=>{
      if(req.url==='/retire') {
        server.close();
        res.end('retired');
        return;
      }
      let body='';
      req.on('data',chunk=>body+=chunk);
      req.on('end',()=>res.end(JSON.stringify({pid:process.pid,body})));
    });
    acknowledgeDevelopmentConnections(server);
    server.listen(0,'127.0.0.1',()=>process.send({type:'ready',port:server.address().port}));
  `);
  const request = (path = '', body?: string) => fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST', body,
    headers: { Connection: 'close' }, signal: AbortSignal.timeout(10000),
  });
  const previous = await (await request()).json();
  expect(await (await request('/retire')).text()).toBe('retired');
  const bodies = Array.from({ length: 8 }, (_, i) => `${i}:${'x'.repeat(128 * 1024)}`);
  const responses = await Promise.all(bodies.map(async body => {
    const response = await request('', body);
    expect(response.status).toBe(200);
    return response.json();
  }));
  expect(new Set(responses.map(response => response.pid)).size).toBe(1);
  for (const [i, response] of responses.entries()) {
    expect(response.pid).not.toBe(previous.pid);
    expect(response.body).toBe(bodies[i]);
  }
}, 20000);

test('returns a clean HTTP 503 when no child becomes ready before the deadline', async () => {
  const origin = await fixture('setInterval(()=>{},1000);', 100);
  const response = await fetch(origin, {
    headers: { Connection: 'close' }, signal: AbortSignal.timeout(2000),
  });
  expect(response.status).toBe(503);
  expect(response.headers.get('connection')).toBe('close');
  expect(response.headers.get('retry-after')).toBe('1');
  expect(await response.text()).toBe('Development server is restarting. Try again shortly.\n');
});

test('waits for child acceptance when a TCP handshake succeeds against an exiting child', async () => {
  const origin = await fixture(`
    import {createServer} from 'node:http';
    import {existsSync,writeFileSync,readFileSync} from 'node:fs';
    const marker=new URL('first-pid',import.meta.url);
    const first=!existsSync(marker);
    if(first) writeFileSync(marker,String(process.pid));
    const server=createServer((req,res)=>res.end(JSON.stringify({
      pid:process.pid,firstPid:Number(readFileSync(marker,'utf8')),
    })));
    acknowledgeDevelopmentConnections(server);
    server.listen(0,'127.0.0.1',()=>{
      process.send({type:'ready',port:server.address().port},()=>{
        if(first) {
          // The OS can complete TCP handshakes, but JS cannot accept/serve them.
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000);
          process.exit(1);
        }
      });
    });
  `);
  const response = await fetch(origin, {
    headers: { Connection: 'close' }, signal: AbortSignal.timeout(10000),
  });
  expect(response.status).toBe(200);
  const { pid, firstPid } = await response.json();
  expect(pid).not.toBe(firstPid);
}, 20000);
