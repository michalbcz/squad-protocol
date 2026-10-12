import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { SCENARIOS, WEAPONS } from '@sp/content';
import { MAX_FRAME_BYTES, parseClientMessage } from '@sp/net';
import { Rooms, type Peer } from './rooms';

export interface HostOptions { port?: number; hostname?: string; staticDir?: string }
export function createHost(options: HostOptions = {}) {
  const root = resolve(options.staticDir ?? fileURLToPath(new URL('../../web/dist', import.meta.url)));
  const rooms = new Rooms(SCENARIOS.kestrel!, WEAPONS);
  const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let path: string;
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://host').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (path === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}'); return; }
    const target = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!target.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if (path.split('/').some((part) => part.startsWith('.'))) { res.writeHead(404).end(); return; }
    try {
      const actual = await realpath(target);
      if (!actual.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      if (!(await stat(actual)).isFile()) { res.writeHead(404).end(); return; }
      const data = await readFile(actual);
      res.writeHead(200, { 'Content-Type': mime[extname(actual)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404).end(); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let allowed = req.url === '/ws' && wss.clients.size < 256;
    if (req.headers.origin) {
      try { allowed &&= new URL(req.headers.origin).host === req.headers.host; } catch { allowed = false; }
    }
    if (!allowed) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  const alive = new Set<WebSocket>();
  wss.on('connection', (socket) => {
    const peer: Peer = {
      send: (message) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > 1024 * 1024) { socket.terminate(); return; }
        socket.send(JSON.stringify({ version: 1, ...message }));
      },
      close: () => socket.close(4001, 'Seat resumed'),
    };
    alive.add(socket);
    let count = 0; let windowStart = Date.now();
    socket.on('pong', () => alive.add(socket));
    socket.on('error', () => socket.terminate());
    socket.on('message', (data, binary) => {
      if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); count = 0; }
      if (++count > 120) { peer.send({ kind: 'error', code: 'rateLimited' }); socket.close(4008); return; }
      let input: unknown;
      try {
        if (binary) throw new Error('Binary frame');
        input = JSON.parse(data.toString());
        if (input && typeof input === 'object' && 'version' in input && input.version !== 1) {
          peer.send({ kind: 'error', code: 'versionMismatch' }); return;
        }
        const message = parseClientMessage(input);
        rooms.handle(peer, message);
      } catch { peer.send({ kind: 'error', code: 'invalidMessage' }); }
    });
    socket.on('close', () => { alive.delete(socket); rooms.disconnect(peer); });
  });
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.delete(socket)) socket.terminate(); else socket.ping();
    }
    rooms.sweep();
  }, 15_000);
  heartbeat.unref();
  return {
    server,
    async listen(): Promise<number> {
      await new Promise<void>((accept, reject) => {
        server.once('error', reject);
        server.listen(options.port ?? 8080, options.hostname ?? '0.0.0.0', () => { server.off('error', reject); accept(); });
      });
      return (server.address() as { port: number }).port;
    },
    async close(): Promise<void> {
      clearInterval(heartbeat);
      for (const socket of wss.clients) socket.terminate();
      await new Promise<void>((accept) => wss.close(() => accept()));
      await new Promise<void>((accept, reject) => server.close((err) => err ? reject(err) : accept()));
    },
  };
}
