import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveBuiltClient } from './static.js';

let tmp: string;
let server: Server;
let base: string;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'truco-static-'));
  // The bundle sits under a directory named "assets" on purpose: only the
  // bundle's own assets/ folder may be cached forever, not index.html.
  const clientDir = path.join(tmp, 'assets', 'client');
  fs.mkdirSync(path.join(clientDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>t</title>');
  fs.writeFileSync(path.join(clientDir, 'assets', 'main-abc123.js'), 'console.log(1);');

  const app = express();
  serveBuiltClient(app, clientDir);
  const s = app.listen(0, '127.0.0.1');
  server = s;
  await new Promise<void>((resolve) => s.once('listening', resolve));
  base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('serveBuiltClient', () => {
  it('caches fingerprinted assets forever', async () => {
    const res = await fetch(`${base}/assets/main-abc123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('does not cache index.html forever', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).not.toContain('immutable');
  });

  it('falls back to index.html for app routes', async () => {
    const res = await fetch(`${base}/sala/BAR7`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>t</title>');
  });

  it('returns 404 for missing files instead of index.html', async () => {
    const res = await fetch(`${base}/assets/main-old999.js`);
    expect(res.status).toBe(404);
  });
});
