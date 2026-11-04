import express from 'express';
import QRCode from 'qrcode';
import type { LanAddress, ServerInfo } from '../shared/types.js';
import { lanAddresses } from './lan.js';

export interface AppOptions {
  /** Port the HTTP server listens on, used to build the LAN URLs. */
  port: number;
  /** Injectable for tests. Defaults to reading this machine's interfaces. */
  getAddresses?: (port: number) => LanAddress[];
}

/**
 * The HTTP API. Client files (Vite in dev, the built bundle in prod) are
 * mounted after this by server/index.ts.
 */
export function createApp({ port, getAddresses = lanAddresses }: AppOptions): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // Interfaces can change while the server runs (e.g. the host joins a
  // hotspot), so they are read on every request rather than cached.
  const info = (): ServerInfo => ({ name: 'Truco de Boteco', port, urls: getAddresses(port) });

  app.get('/api/info', (_req, res) => {
    res.set('Cache-Control', 'no-store').json(info());
  });

  /** QR code of the best LAN URL, so the lobby can show it to friends. */
  app.get('/api/qr.svg', async (_req, res) => {
    const primary = info().urls[0];
    if (!primary) {
      res.status(404).json({ error: 'no_lan_address' });
      return;
    }
    const svg = await QRCode.toString(primary.url, { type: 'svg', margin: 1 });
    res.set('Cache-Control', 'no-store').type('image/svg+xml').send(svg);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
