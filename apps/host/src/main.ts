import { networkInterfaces } from 'node:os';
import { createHost } from './server';

const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
const host = createHost({ port, hostname: process.env.SP_HOST ?? '0.0.0.0' });
await host.listen();
console.log(`Squad Protocol host: http://localhost:${port}`);
for (const addresses of Object.values(networkInterfaces())) for (const address of addresses ?? []) {
  if (address.family === 'IPv4' && !address.internal) console.log(`LAN: http://${address.address}:${port}`);
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void host.close().then(() => process.exit(0)); });
