import http from 'node:http';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { DEFAULT_PORT, type LanAddress } from '../shared/types.js';
import { createApp } from './app.js';
import { lanAddresses } from './lan.js';
import { serveBuiltClient } from './static.js';
import { attachWebSocket } from './ws.js';

/** Listen on every interface so phones on the same Wi-Fi/hotspot can connect. */
const HOST = '0.0.0.0';
const isDev = process.argv.includes('--dev');
const port = parsePort(process.env.PORT);

// Same relative path in both modes: server/ -> client/ (sources, served by
// Vite) and dist/server/ -> dist/client/ (built bundle).
const clientDir = fileURLToPath(new URL('../client', import.meta.url));

const app = createApp({ port });
const httpServer = http.createServer(app);
const gameWs = attachWebSocket(httpServer);
let closeVite: (() => Promise<void>) | undefined;

if (isDev) {
  // Imported lazily: vite is a dev dependency and is absent in production.
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    appType: 'spa',
    // HMR shares our HTTP server, so dev uses a single port like production.
    server: { middlewareMode: true, hmr: { server: httpServer } },
  });
  app.use(vite.middlewares);
  closeVite = () => vite.close();
} else {
  serveBuiltClient(app, clientDir);
}

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`A porta ${port} já está em uso. Tente: PORT=${port + 1} npm start`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

httpServer.listen(port, HOST, () => {
  // The banner is cosmetic: a failure here (e.g. QR rendering) must not
  // become an unhandled rejection that kills a server that is already up.
  printBanner(lanAddresses(port)).catch((err: unknown) => {
    console.error('Não consegui imprimir o banner:', err);
  });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void gameWs.close();
    httpServer.close();
    httpServer.closeAllConnections();
    void (closeVite?.() ?? Promise.resolve()).finally(() => process.exit(0));
  });
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.error(`PORT inválida: "${raw}". Use um número entre 1 e 65535.`);
    process.exit(1);
  }
  return n;
}

async function printBanner(addresses: LanAddress[]): Promise<void> {
  const lines = [
    '',
    `  🍺 Truco de Boteco ${isDev ? '(dev)' : ''}`,
    '',
    `  Local:  http://localhost:${port}`,
  ];
  for (const a of addresses) {
    lines.push(`  Rede:   ${a.url}  (${a.iface}${a.virtual ? ', virtual' : ''})`);
  }
  const primary = addresses[0];
  if (!primary) {
    lines.push('', '  Nenhuma rede encontrada. Conecte este computador ao Wi-Fi ou hotspot.');
    console.log(lines.join('\n') + '\n');
    return;
  }
  const qr = await QRCode.toString(primary.url, { type: 'terminal', small: true });
  lines.push('', `  Aponte a câmera do celular para entrar em ${primary.url}:`, '', qr);
  console.log(lines.join('\n'));
}
