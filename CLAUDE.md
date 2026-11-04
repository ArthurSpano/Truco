# Truco de Boteco — LAN multiplayer card game

Build a LAN-only, mobile-first web game of **Truco Paulista** with a Brazilian *boteco* look. Friends join from their phone browsers over a hotspot/Wi-Fi. Inspired by the feel of *Capote* (Steam) but much simpler. All art, names and sounds must be **original** (no copied assets, no real beer brands/logos).

Secondary goal: this is a portfolio project. Keep the code clean, typed, tested, and add a short README explaining the networking and architecture decisions.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+, TypeScript (strict) |
| Server | Express (static files + `/api/info`) + `ws` (WebSockets) |
| Client | Vite + TypeScript, vanilla DOM + CSS (no framework). Cards, chairs and table are DOM/SVG/CSS, not canvas |
| Shared | `/shared` folder with message types and constants, imported by server and client |
| Tests | Vitest for the game engine |
| Extras | `qrcode` (QR of the LAN URL in the server console and lobby), optional PWA manifest, optional `mkcert` HTTPS |

Single process, single command: `npm run dev` (Vite + server with watch) and `npm start` (serves built client from Express). **The server must listen on `0.0.0.0`**, default port `3000` (env `PORT`).

### Folder layout
```
/server    index.ts (express+ws), rooms.ts, net.ts (protocol handling), bots.ts
/engine    pure game logic, zero I/O: deck.ts, rules.ts, game.ts, *.test.ts
/shared    protocol.ts (message types), types.ts
/client    index.html, main.ts, ui/ (lobby, table, hand, chat bubbles), styles/, assets/
```

---

## 2. Networking architecture (the part to show off)

- **Server-authoritative.** The server owns all game state. Clients send *intents* only (`play_card`, `call_truco`...) and render what the server sends. Never trust the client.
- **Hidden information.** The server sends each player a *personalized* view: only their own hand, plus card counts for others. Never broadcast other players' cards. (Exception: *mão de onze*, see rules.)
- **WebSocket JSON protocol**, every message `{ t: string, ...payload }`, typed in `/shared/protocol.ts` as discriminated unions.
  - Client -> Server: `join_room {code, name}`, `create_room {mode: 2|4|6}`, `pick_seat {seat}`, `ready`, `play_card {cardId, faceDown}`, `call_truco`, `respond {answer: "accept"|"run"|"raise"}`, `mao11_decision {play: boolean}`, `chat_quick {phraseId}`, `rejoin {token}`.
  - Server -> Client: `room_state` (lobby/seats), `game_state` (personalized snapshot after every change), `event` (animations/sounds: card played, truco called, trick won, hand won), `error {code, msg}`.
- **Send full snapshots** after each state change (state is tiny). Simpler than diffs and makes reconnect trivial.
- **Reconnection.** On join, server issues a `token` (stored in `localStorage`); `rejoin {token}` restores the seat and current snapshot. Mark disconnected players, hold their seat; optional bot takeover after 60s.
- **Heartbeat.** Ping/pong every 15s; drop dead sockets.
- **Rooms.** 4-letter room code (e.g. `BAR7`). Host picks mode (2, 4 or 6 players). Seats assigned in lobby; teams are fixed by seat parity.
- **LAN discovery UX.** On startup, enumerate `os.networkInterfaces()`, print every IPv4 URL (`http://192.168.x.x:3000`) and a terminal QR code. The lobby also shows the URL + QR so friends can scan it. `GET /api/info` returns the LAN URLs.
- **Validation.** Validate every incoming message (shape, sender's turn, legality). Reply with `error` and ignore invalid intents. Rate-limit per socket.
- **Optional bots** (`bots.ts`) fill empty seats with a simple rule-based AI (play lowest winning card, accept truco if hand strong). Useful for solo testing; keep it simple.

---

## 3. Game rules — Truco Paulista (engine, pure & tested)

**Deck:** 40 cards (remove 8, 9, 10 and jokers). Ranks low -> high: `4 5 6 7 Q J K A 2 3`. Suits: ♣ Paus, ♥ Copas, ♠ Espadas, ♦ Ouros.

**Vira & manilhas:** after dealing, flip one card (*vira*). The **manilha** is the next rank after the vira (vira 3 -> manilha 4; wraps). Manilhas beat all other cards, ordered by suit: **♣ (zap) > ♥ (copas) > ♠ (espadilha) > ♦ (pica-fumo)**. Non-manilha cards compare by rank only; same rank = tie (*empate/embuchada*).

**Modes & seating:** 
- 2 players: 1v1, 3 cards each.
- 4 players: 2v2, partners sit opposite. 
- 6 players: 3v3, teams alternate seats (A,B,A,B,A,B).
- Always 3 cards per player. Turn order is counter-clockwise. Dealer rotates each hand; player to dealer's right starts (*mão*).

**Hand:** best of 3 tricks. Each trick: every player plays one card in turn; highest card wins and its player leads next trick. Team with 2 trick wins takes the hand.

**Ties:** 
- Trick 1 tied -> winner of trick 2 wins the hand; if trick 2 also tied -> trick 3 decides; if all tied -> team of the *mão* wins.
- Trick 1 won, trick 2 tied -> trick-1 winner wins the hand.
- 1-1 and trick 3 tied -> trick-1 winner wins.

**Face-down play (*encoberta*):** from trick 2 onward a player may play a card face down; it counts as a non-winning card (loses to any face-up card) and hides its identity.

**Points:** hand is worth 1 point. First team to **12** wins the match.

**Truco ladder:** any player may call on their turn: *Truco* (3) -> *Seis* (6) -> *Nove* (9) -> *Doze* (12). Opposing team answers: **accept**, **run** (calling team scores the *current* value before the raise: 1 for first truco), or **raise** (next step). Only the team that did *not* make the latest raise may raise again. In 4/6 player games any member of the answering team can respond (first answer wins; show the prompt to all of them).

**Mão de onze:** a team at 11 points sees its partners' cards (in 2 players, just their own) and decides to **play** (hand worth 3, no truco allowed) or **run** (opponents get 1 point). 
**Mão de ferro:** both teams at 11 -> cards played blind (face down), no truco, hand worth 1.

Put rule variants as constants in `/engine/config.ts` (tie behavior, ladder values) so they are easy to tweak.

### Engine requirements
- Pure functions / state machine: `createGame(mode)`, `applyIntent(state, seat, intent) -> {state, events} | Error`, `viewFor(state, seat)`.
- Seeded RNG for deterministic tests.
- Vitest coverage at minimum: manilha wrap-around, suit order, every tie scenario, truco ladder (accept/run/raise, who may raise), mão de onze, mão de ferro, face-down cards, win at 12, 2/4/6 seat order.

---

## 4. UI / Visual direction — "Boteco brasileiro"

**Scene (top-down, slightly stylized):** a worn square/round **wooden bar table** in the centre with a checkered tablecloth patch or laminate top, a few **beer bottles and glasses**, a bowl of **petiscos** (amendoim), ashtray-free. Around it, **red and white plastic chairs** (the classic stackable kind) one per player, with each player's avatar/name tag on the chair. Background: tiled floor (azulejo/chessboard), a neon sign ("BOTECO" or a made-up name), string lights, warm lighting, maybe a soccer game glow from a TV. Palette: warm yellows/ambers, red, deep green, wood browns. Draw with CSS/SVG; keep it light for phones.

**Layout by mode (portrait phone):**
- 2p: you bottom, opponent top.
- 4p: you bottom, partner top, opponents left/right.
- 6p: you bottom, hexagon around the table, teammates alternate seats.
- Your hand fans at the bottom (large, tappable cards, tap to select + tap again/drag to play; toggle for face-down). Other players show card backs.
- Centre: played cards per trick, the **vira** and the highlighted manilha, current hand value, score for both teams (*Nós* x *Eles*), and trick-result pips.

**Capote-like feel (simple):**
- **Speech bubbles** from each player: big loud **"TRUCO!"**, "SEIS!", "NOVE!", "DOZE!", "Corre!", "Aceito!" with screen-shake/flash and sound.
- Quick-chat buttons (no free text needed): "Bora!", "Tá fraco", "Truco, ladrão!", "Esse é meu", "Rapaz...". 
- Action bar: **TRUCO** button (changes to SEIS/NOVE/DOZE), response buttons Aceitar / Correr / Aumentar, and a face-down toggle.
- Small animations: card slides to the table, trick sweeps toward the winner, chair wiggles on your turn.
- Sound: card slap, table knock on truco, crowd ambience (royalty-free or generated with WebAudio). Mute toggle.
- Copy in Brazilian Portuguese (pt-BR) by default.

**Responsive/mobile rules:** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, touch-first (no hover-only UI), min tap target 44px, `touch-action: manipulation`, lock to portrait where possible, prevent pull-to-refresh/double-tap zoom, test at 360x640 and on desktop.

---

## 5. Milestones (do in order, commit after each)

1. Project scaffold, scripts, `0.0.0.0` server, LAN URL printout + QR, `/api/info`.
2. Engine + tests (rules above) with a CLI/test harness simulating full games for 2/4/6.
3. WebSocket protocol, rooms, seats, personalized snapshots, rejoin tokens.
4. Lobby UI (create/join by code, pick seat, ready, QR).
5. Table UI with chairs/table for 2/4/6, hand, playing cards, scores, vira.
6. Truco flow UI (bubbles, ladder, mão de onze/ferro screens).
7. Polish: animations, sounds, quick-chat, reconnect handling, PWA manifest.
8. Stretch: bots, mkcert HTTPS, stats, README with architecture diagram.

## 6. Constraints & conventions

- TypeScript strict, ESLint + Prettier, no `any` in shared/engine.
- Engine has no imports from server/client; client never imports engine logic (it only renders snapshots).
- Never leak hidden cards in any message or log.
- LAN-only: do not add accounts, databases, or external services. State is in memory.
- Document in README: how to run on a phone hotspot (host joins hotspot, share URL/QR), firewall note (allow the port), and the "client isolation" gotcha.
- Ask before adding dependencies beyond those listed.
