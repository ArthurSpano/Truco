# Truco de Boteco

Truco Paulista for a group of friends on the same Wi-Fi or phone hotspot. One computer runs the server; everyone else plays from their phone's browser. No accounts, no internet, no app install.

> Status: milestone 1 of 8 (project scaffold and LAN server). The game itself is not playable yet.

## Running it

Requires Node.js 20.19+.

```bash
npm install
npm run dev      # server + Vite with hot reload, on port 3000
```

For a production-style run:

```bash
npm run build    # bundles client into dist/client, compiles server into dist/server
npm start        # serves everything from one Express process
```

On startup the server prints every LAN address it found, plus a QR code in the terminal:

```
  Local:  http://localhost:3000
  Rede:   http://192.168.0.12:3000  (wlan0)

  Aponte a câmera do celular para entrar em http://192.168.0.12:3000:
  ▄▄▄▄▄▄▄ ...
```

Friends scan the QR code or type the URL. Set `PORT` to change the port (`PORT=8080 npm start`).

| Script              | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Dev server with watch + HMR (one port)                       |
| `npm run build`     | Production build into `dist/`                                |
| `npm start`         | Run the production build                                     |
| `npm test`          | Vitest                                                       |
| `npm run simulate`  | Play many full 2/4/6 matches, check invariants (`-- --help`) |
| `npm run typecheck` | `tsc` for the Node side and the client                       |
| `npm run lint`      | ESLint (type-aware, strict)                                  |
| `npm run check`     | typecheck + lint + format check + tests                      |

## Playing on a phone hotspot

1. Turn on the hotspot on one phone.
2. Connect the computer running the server to that hotspot, then start the server.
3. Everyone else joins the same hotspot and scans the QR code (or types the URL).

The phone hosting the hotspot can play too: it is on the same network.

### When phones can't connect

- **Firewall.** The computer must accept incoming connections on the port (3000 by default). On Windows, allow Node.js on _private_ networks when prompted. On Linux with `ufw`: `sudo ufw allow 3000/tcp`. On macOS, allow incoming connections for `node`.
- **Client isolation.** Some routers (and most guest/public networks) block devices from talking to each other. The page never loads, even though the URL is right. Use a phone hotspot or turn off "AP/client isolation" on the router.
- **Wrong address.** If the computer has several networks (Docker, VPN, VMs), the server lists them all and puts the most likely one first; virtual interfaces are labelled and sorted last. Try the other URLs if the first one fails.

## Architecture

```
server/   Express + ws. Listens on 0.0.0.0, serves the client and the API.
engine/   Pure Truco rules, no I/O (milestone 2).
shared/   Types shared by server and client (API and, later, the WebSocket protocol).
client/   Vite + TypeScript, vanilla DOM and CSS. Only renders what the server sends.
```

Decisions so far:

- **One process, one port, in dev and prod.** In dev, Express hosts Vite as middleware and Vite's HMR WebSocket shares the same HTTP server. A phone loading `http://<lan-ip>:3000` behaves the same in both modes, with no CORS or proxy setup.
- **Listen on `0.0.0.0`.** Binding to `localhost` would make the server reachable only from the host computer.
- **LAN address discovery.** `server/lan.ts` reads `os.networkInterfaces()`, keeps non-internal IPv4 addresses, drops link-local `169.254.x.x`, and ranks them: physical interfaces before virtual ones (Docker, VPN, VM bridges), then `192.168.x` > `10.x` > `172.16–31.x`. It is a pure function with unit tests.
- **Interfaces are read per request.** If the host joins a hotspot after starting the server, `/api/info` and the QR code pick up the new address.
- **Enforced boundaries.** ESLint forbids `engine/` from importing `server/` or `client/`, `shared/` from importing anything but itself, and the client from importing `engine/` or `server/`. The client can only render server snapshots.
- **Caching.** Vite's fingerprinted `assets/` are cached forever; `index.html` is revalidated, so phones get a new build on reload. Unknown app routes fall back to `index.html`, but missing files 404 (a stale bundle never gets HTML in place of JavaScript).

### HTTP API

| Route             | Returns                                                       |
| ----------------- | ------------------------------------------------------------- |
| `GET /api/info`   | `{ name, port, urls: [{ iface, address, url, virtual }] }`    |
| `GET /api/qr.svg` | QR code (SVG) of the best LAN URL; 404 if there is no network |

Types live in `shared/types.ts`.
