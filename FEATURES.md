# Features

Progress tracker for Truco de Boteco. Check a box once the feature is working and tested.

## 1. Project scaffold and LAN server

- [x] Single process serves API and client (Express + Vite middleware in dev, built `dist/` in prod)
- [x] Server listens on `0.0.0.0`, port `3000` by default (`PORT` env to change)
- [x] LAN address discovery (`os.networkInterfaces()`, link-local dropped, physical before virtual, `192.168` > `10` > `172.16–31`)
- [x] Startup printout of every LAN URL plus terminal QR code
- [x] `GET /api/info` returns the LAN URLs
- [x] `GET /api/qr.svg` returns a QR code of the best LAN URL
- [x] Scripts: `dev`, `build`, `start`, `test`, `typecheck`, `lint`, `check`
- [x] Import boundaries enforced by ESLint (engine/shared vs server/client)

## 2. Game engine

- [x] 40-card deck, rank order, vira and manilha (with wrap-around)
- [x] Manilha suit order (zap > copas > espadilha > pica-fumo)
- [x] Seeded RNG for deterministic tests
- [x] 2, 4 and 6 player seating, counter-clockwise turns, dealer rotation
- [x] Tricks, hand resolution and all tie scenarios
- [ ] Face-down play (encoberta) from trick 2
- [ ] Truco ladder: Truco → Seis → Nove → Doze (accept / run / raise, who may raise)
- [ ] Mão de onze
- [ ] Mão de ferro
- [ ] Win at 12 points
- [ ] `createGame`, `applyIntent`, `viewFor`
- [ ] Rule variants in `engine/config.ts`
- [ ] Vitest coverage and a harness simulating full 2/4/6 player games

## 3. Networking

- [ ] WebSocket JSON protocol with typed messages in `shared/protocol.ts`
- [ ] Rooms with 4-letter codes, host picks mode (2/4/6)
- [ ] Seat picking, teams by seat parity
- [ ] Server-authoritative state, personalized snapshots (no hidden-card leaks)
- [ ] Message validation and per-socket rate limit
- [ ] Rejoin tokens and seat holding on disconnect
- [ ] Ping/pong heartbeat every 15s

## 4. Lobby UI

- [ ] Create room / join by code
- [ ] Pick seat and ready up
- [ ] Lobby shows LAN URL and QR

## 5. Table UI

- [ ] Boteco scene (table, chairs, neon sign, tiled floor) in CSS/SVG
- [ ] Layouts for 2, 4 and 6 players
- [ ] Hand fan, card selection and play
- [ ] Played cards, vira and manilha highlight, hand value, score (Nós x Eles), trick pips

## 6. Truco flow UI

- [ ] Speech bubbles (TRUCO!, SEIS!, NOVE!, DOZE!, Corre!, Aceito!)
- [ ] Action bar: truco/raise button, Aceitar / Correr / Aumentar, face-down toggle
- [ ] Mão de onze and mão de ferro screens

## 7. Polish

- [ ] Animations (card slide, trick sweep, chair wiggle, screen shake)
- [ ] Sounds with WebAudio and mute toggle
- [ ] Quick-chat phrases
- [ ] Reconnect handling in the UI
- [ ] PWA manifest
- [ ] Mobile rules: portrait, 44px tap targets, no pull-to-refresh or double-tap zoom

## 8. Stretch

- [ ] Bots for empty seats
- [ ] mkcert HTTPS
- [ ] Stats
- [ ] README architecture diagram
