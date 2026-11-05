import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { LanAddress, ServerInfo } from '../shared/types.js';
import { createApp } from './app.js';

const wifi: LanAddress = {
  iface: 'wlan0',
  address: '192.168.0.12',
  url: 'http://192.168.0.12:3000',
  virtual: false,
};

let server: Server | undefined;

async function start(addresses: LanAddress[]): Promise<string> {
  const app = createApp({ port: 3000, getAddresses: () => addresses });
  const s = app.listen(0, '127.0.0.1');
  server = s;
  await new Promise<void>((resolve) => s.once('listening', resolve));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

afterEach(async () => {
  const s = server;
  server = undefined;
  // Resolve right away when a test never started a server; otherwise the
  // promise would never settle and the hook would hang until it times out.
  if (s) await new Promise((resolve) => s.close(resolve));
});

describe('GET /api/info', () => {
  it('returns the port and LAN URLs', async () => {
    const base = await start([wifi]);
    const res = await fetch(`${base}/api/info`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as ServerInfo;
    expect(body).toEqual({ name: 'Truco de Boteco', port: 3000, urls: [wifi] });
  });
});

describe('GET /api/qr.svg', () => {
  it('returns an SVG QR code for the primary URL', async () => {
    const base = await start([wifi]);
    const res = await fetch(`${base}/api/qr.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    expect(await res.text()).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });

  it('returns 404 when there is no LAN address', async () => {
    const base = await start([]);
    const res = await fetch(`${base}/api/qr.svg`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_lan_address' });
  });
});

describe('unknown /api routes', () => {
  it('return JSON 404', async () => {
    const base = await start([wifi]);
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});
