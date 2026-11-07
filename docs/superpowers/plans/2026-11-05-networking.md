# Networking (Milestone 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A server-authoritative WebSocket layer: typed JSON protocol, 4-character rooms, seat picking, personalized game snapshots, validation and rate limiting, rejoin tokens, and a 15 s heartbeat.

**Architecture:** Three layers, each testable without the one above. `server/room.ts` and `server/rooms.ts` hold lobby and game state and do no I/O. `server/net.ts` turns one parsed message into state changes plus outbound messages through an abstract `Connection`, so it is tested with fakes. `server/ws.ts` is the only file that touches the `ws` library: it attaches to the existing HTTP server, owns heartbeat and per-socket rate limiting, and feeds `net.ts`. The engine (`createGame`, `applyIntent`, `viewFor`) already exists and is only called from `room.ts`.

**Tech Stack:** Node 20+, TypeScript strict, `ws` (already a dependency), Vitest. No new dependencies.

**Spec:** `CLAUDE.md` §2 (Networking architecture) and §6 (Constraints). Scope: `FEATURES.md` section 3 only. Out of scope: bots and bot takeover (milestone 8), any client UI (milestones 4–7), and the unchecked "Vitest coverage and harness" box in `FEATURES.md` section 2, which this plan does not touch.

**Execution note:** Do not implement on `main`. Use a worktree on branch `milestone-3-networking` (the user has not yet consented to working on `main`).

## Global Constraints

- TypeScript `strict`; no `any` in `shared/` or `engine/`; ESLint (`strictTypeChecked`) and Prettier must pass (`npm run check`).
- `engine/` and `shared/` must not import from `server/` or `client/`; `shared/` must not import from `engine/` (ESLint enforces this). `server/` may import `engine/` and `shared/`. The client never imports engine logic.
- Every WebSocket message is JSON `{ t: string, ...payload }`, typed as discriminated unions in `shared/protocol.ts`.
- The server owns all game state and never trusts the client. Clients send intents only.
- Each player receives a personalized `GameView` from `viewFor`; other players' cards, face-down identities and the RNG state must never appear in any message or log.
- Send a full `game_state` snapshot after every state change.
- Invalid messages get an `error { code, msg }` reply and are ignored. Validate shape, sender's turn and legality.
- Rooms: 4-character code, host picks mode 2, 4 or 6, teams fixed by seat parity (`teamOf`).
- Reconnect: server issues a `token` on join; `rejoin {token}` restores seat and snapshot; disconnected players are marked and their seat is held.
- Heartbeat: ping/pong every 15 s, dead sockets dropped. Rate-limit per socket.
- The server already listens on `0.0.0.0` port 3000 (`PORT` env). Keep that. No accounts, databases or external services; state is in memory.
- Do not add dependencies.
- Commit messages end with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Each task also ticks its `FEATURES.md` box(es) in the same commit.

## Review Focus

Failure modes the spec implies but does not spell out. Each has a test in the task named in brackets.

1. Non-JSON, binary, array, `null`, oversized or unknown-`t` payloads get `error { code: 'bad_message' }` and the connection stays open. [Task 1, Task 6]
2. A lowercase or space-padded room code still joins (`" bar7 "` → `BAR7`); an empty, whitespace-only or over-long name is rejected, not stored. [Task 1, Task 3]
3. The same token used from a second socket (phone reload) takes over the seat: the old socket is closed, the new one gets `joined`, `room_state` and the current snapshot. [Task 5]
4. Joining a full or already-started room, picking an occupied seat, or an out-of-range seat returns a coded error and changes nothing. [Task 2]
5. A player who drops mid-hand keeps the seat, others see `connected: false`, game state is unchanged; a lobby player who stays disconnected past the grace period is removed so they cannot block the start. [Task 2, Task 3, Task 5]

---

### Task 1: Protocol types and message validation

**Files:**
- Create: `shared/protocol.ts`
- Create: `server/validate.ts`
- Test: `server/validate.test.ts`
- Modify: `FEATURES.md` (tick "WebSocket JSON protocol with typed messages")

**Interfaces:**
- Consumes: `GameIntent`, `GameMode`, `Seat`, `GameView`, `GameEvent` from `shared/types.ts`.
- Produces, all exported from `shared/protocol.ts`:
  - constants `ROOM_CODE_LENGTH = 4`, `MAX_NAME_LENGTH = 16`, `MAX_MESSAGE_BYTES = 2048`, `HEARTBEAT_INTERVAL_MS = 15_000`, `ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'` (no I/O/0/1, which are easy to misread on a phone), `QUICK_PHRASES = ['bora', 'fraco', 'truco_ladrao', 'meu', 'rapaz'] as const`.
  - `type PhraseId = (typeof QUICK_PHRASES)[number]`
  - `type ErrorCode = 'bad_message' | 'rate_limited' | 'not_in_room' | 'already_in_room' | 'room_not_found' | 'room_full' | 'room_started' | 'bad_token' | 'bad_seat' | 'seat_taken' | 'need_seat' | 'not_in_lobby' | 'not_playing' | 'illegal_intent'`
  - `type ClientMessage = { t: 'create_room'; mode: GameMode; name: string } | { t: 'join_room'; code: string; name: string } | { t: 'rejoin'; token: string } | { t: 'pick_seat'; seat: Seat } | { t: 'ready' } | GameIntent | { t: 'chat_quick'; phraseId: PhraseId }`. (`create_room` gains `name` versus the spec's `{mode}` because the host needs a display name. `ready` toggles.)
  - `interface PlayerInfo { id: string; name: string; seat: Seat | null; ready: boolean; connected: boolean; host: boolean }`
  - `interface RoomState { code: string; mode: GameMode; status: 'lobby' | 'playing' | 'finished'; you: string; players: PlayerInfo[] }` (`you` is the receiving player's id.)
  - `type ServerMessage = { t: 'joined'; token: string; code: string } | { t: 'room_state'; room: RoomState } | { t: 'game_state'; view: GameView } | { t: 'event'; event: GameEvent } | { t: 'chat'; seat: Seat; phraseId: PhraseId } | { t: 'error'; code: ErrorCode; msg: string }`
- Produces from `server/validate.ts`: `type ParseResult = { ok: true; msg: ClientMessage } | { ok: false; msg: string }` and `parseClientMessage(raw: string): ParseResult`. It normalizes: room code trimmed and upper-cased, names trimmed with inner whitespace collapsed.

- [ ] **Step 1: Write the failing tests** in `server/validate.test.ts`. Each case calls `parseClientMessage(JSON.stringify(...))`:
  - accepts one valid example of every `ClientMessage` variant, including `{t:'play_card', cardId:'Ac', faceDown:true}`, `{t:'play_blind', slot:0}`, `{t:'respond', answer:'raise'}`, `{t:'mao11_decision', play:false}`, `{t:'create_room', mode:4, name:'Ana'}`;
  - `join_room` with `code: ' bar7 '` and `name: '  Zé   Carlos '` yields `code: 'BAR7'`, `name: 'Zé Carlos'`;
  - rejects (each `ok: false`): invalid JSON text, `'null'`, `'[]'`, `'42'`, `{}`, `{t:'nope'}`, `{t:'create_room', mode:3, name:'A'}`, mode as the string `"4"`, `name` of `''`, `'   '` and 17 characters, `code` of 3 characters or containing `!`, `cardId:'1x'`, `cardId:'10c'`, `faceDown:'yes'`, `slot:-1`, `slot:1.5`, `seat:'1'`, `answer:'maybe'`, `play:'true'`, `phraseId:'unknown'`, `rejoin` with `token: ''`;
  - rejects a string longer than `MAX_MESSAGE_BYTES` even if it is valid JSON (byte length via `Buffer.byteLength`).
- [ ] **Step 2: Run** `npx vitest run server/validate.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `shared/protocol.ts` (types and constants exactly as listed above; no logic) and `parseClientMessage` in `server/validate.ts`. Validate `cardId` against the 10 ranks × 4 suit codes. No schema library; use small hand-written guards.
- [ ] **Step 4: Run** `npx vitest run server/validate.test.ts` and `npm run typecheck`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `git add shared/protocol.ts server/validate.ts server/validate.test.ts FEATURES.md && git commit -m "Protocol: typed messages and validation"` (with the Co-Authored-By line).

---

### Task 2: Room — lobby, seats, ready, game start, intents

**Files:**
- Create: `server/room.ts`
- Test: `server/room.test.ts`
- Modify: `FEATURES.md` (tick "Seat picking, teams by seat parity")

**Interfaces:**
- Consumes: `GameMode`, `Seat`, `GameIntent`, `GameView`, `GameEvent` from `shared/types.ts`; `PlayerInfo`, `RoomState`, `ErrorCode` from `shared/protocol.ts`; `createGame`, `applyIntent`, `viewFor`, `GameState` from `engine/game.ts`.
- Produces from `server/room.ts`:
  - `type RoomResult<T = undefined> = { ok: true; value: T } | { ok: false; code: ErrorCode; msg: string }`
  - `class Room` with:
    - `constructor(code: string, mode: GameMode, seed?: number)` (seed is passed to `createGame` for deterministic tests)
    - `readonly code: string`, `readonly mode: GameMode`, `get status(): 'lobby' | 'playing' | 'finished'`
    - `addPlayer(name: string, now: number): RoomResult<{ id: string; token: string }>` — first player is host; ids are `p1`, `p2`, …; token is `crypto.randomUUID()`. Errors: `room_full` when `mode` players already joined, `room_started` once playing.
    - `playerByToken(token: string): string | null`
    - `pickSeat(id: string, seat: Seat): RoomResult` — lobby only (`not_in_lobby`), `bad_seat` if out of range or non-integer, `seat_taken` if held by another player. Picking a seat clears the player's `ready`.
    - `toggleReady(id: string): RoomResult` — lobby only; `need_seat` if unseated. When every one of the `mode` seats is taken and all occupants are ready and connected, creates the game via `createGame(mode, seed)` and status becomes `'playing'`.
    - `setConnected(id: string, connected: boolean, now: number): void` — records `disconnectedAt`; never changes seat or game state. A player who disconnects in the lobby also becomes un-ready.
    - `applyGameIntent(id: string, intent: GameIntent): RoomResult<GameEvent[]>` — `not_playing` unless status is `'playing'`; `need_seat` if unseated; engine errors map to `illegal_intent` with the engine error string as `msg`. Status becomes `'finished'` when the engine reports a winner.
    - `seatOf(id: string): Seat | null`
    - `roomStateFor(id: string): RoomState`
    - `gameViewFor(id: string): GameView | null` (null before the game starts)
    - `playerIds(): string[]`
    - `staleLobbyPlayers(now: number, graceMs: number): string[]` and `removePlayer(id: string): void` (lobby only; used by the registry sweep)
    - `lastActivity: number`, updated by every mutating call, so the registry can expire idle rooms.

- [ ] **Step 1: Write the failing tests** in `server/room.test.ts`. Use a helper that fills a room of a given mode with named players. Tests:
  - first joiner is `host: true` in `roomStateFor`; `roomStateFor(id).you === id`;
  - a 2-player room rejects the third `addPlayer` with `room_full`; any `addPlayer` after start returns `room_started`;
  - `pickSeat` happy path; occupied seat → `seat_taken` and state unchanged; seat `-1`, `2` (mode 2), `1.5` → `bad_seat`; a player may move to a free seat and the old one frees up; moving clears `ready`;
  - `toggleReady` without a seat → `need_seat`; toggling twice returns to not ready;
  - game does not start with 1 of 2 ready; starts when both are ready (status `'playing'`, `gameViewFor` non-null); a disconnected seated player blocks the start;
  - parameterised over modes 2, 4, 6: seats `0..mode-1` filled in order, `gameViewFor(id).seat` equals the player's seat and `.team` equals seat parity;
  - `applyGameIntent` before start → `not_playing`; a legal `play_card` for the seat-0 player on a seeded 2-player game (find the card from `gameViewFor(id).players[seat].cards`, and the player whose `view.turn === seat`) returns events and changes `gameViewFor` for the other player (their `trick` has one entry); a play by the player whose turn it is not → `illegal_intent`;
  - `gameViewFor(a)` never contains player b's cards: JSON-stringify it and assert none of b's card ids appears under `players[b.seat].cards` (which is `null`);
  - `setConnected(id, false, t)` keeps the seat, `roomStateFor(other)` shows `connected: false`, and the game view is deep-equal before and after;
  - `staleLobbyPlayers(now, 30_000)` returns a player disconnected 31 s ago, not one disconnected 29 s ago, not a connected one, and returns `[]` once playing; `removePlayer` frees the seat.
- [ ] **Step 2: Run** `npx vitest run server/room.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `Room` in `server/room.ts` as described. Keep the engine state private; only expose views.
- [ ] **Step 4: Run** `npx vitest run server/room.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** (`Room: lobby, seats, ready and game start`).

---

### Task 3: Room registry — codes, tokens, sweep

**Files:**
- Create: `server/rooms.ts`
- Test: `server/rooms.test.ts`
- Modify: `FEATURES.md` (tick "Rooms with 4-letter codes, host picks mode (2/4/6)")

**Interfaces:**
- Consumes: `Room` and `RoomResult` from `server/room.ts`; `ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH` from `shared/protocol.ts`; `isGameMode` from `engine/seating.ts`.
- Produces from `server/rooms.ts`:
  - `interface RegistryOptions { randomInt?: (max: number) => number; seed?: () => number | undefined }` (`randomInt` defaults to `crypto.randomInt`; injected in tests to force collisions).
  - `const LOBBY_GRACE_MS = 30_000`, `const ROOM_IDLE_MS = 600_000`
  - `class RoomRegistry` with:
    - `constructor(opts?: RegistryOptions)`
    - `createRoom(mode: GameMode): Room` — unique code from the alphabet; retries on collision.
    - `getRoom(code: string): Room | undefined` — case-insensitive, trims.
    - `findByToken(token: string): { room: Room; playerId: string } | null`
    - `sweep(now: number): string[]` — removes stale lobby players (`LOBBY_GRACE_MS`), then deletes rooms that have no connected player and `lastActivity` older than `ROOM_IDLE_MS`; returns codes of deleted rooms.
    - `get size(): number`

- [ ] **Step 1: Write the failing tests** in `server/rooms.test.ts`:
  - created codes have length 4 and only alphabet characters; 200 rooms have 200 distinct codes; with `randomInt` forced to return the same value for the first 4 calls then different values, a second `createRoom` still gets a distinct code;
  - `getRoom(' bar7 ')` finds the room whose code is `BAR7` (force the code through `randomInt`), `getRoom('ZZZZ')` is `undefined`;
  - `findByToken` returns the room and player id for a token issued by `room.addPlayer`, and `null` for an unknown token;
  - `sweep`: a lobby player disconnected 31 s ago is removed from its room; a room with all players disconnected and idle 11 min is deleted (and its tokens no longer resolve); a room with a connected player is kept regardless of age; a `'playing'` room with a disconnected player and idle 1 min is kept.
- [ ] **Step 2: Run** `npx vitest run server/rooms.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `RoomRegistry` in `server/rooms.ts`. Token lookup scans rooms (rooms are few; no extra index).
- [ ] **Step 4: Run** `npx vitest run server/rooms.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** (`Rooms: registry with codes, token lookup and sweep`).

---

### Task 4: Per-socket rate limiter

**Files:**
- Create: `server/rateLimit.ts`
- Test: `server/rateLimit.test.ts`
- Modify: `FEATURES.md` (tick "Message validation and per-socket rate limit")

**Interfaces:**
- Produces from `server/rateLimit.ts`: `class RateLimiter` with `constructor(opts: { burst: number; perSecond: number })` and `allow(now: number): boolean` (token bucket; starts full; refills continuously at `perSecond`, capped at `burst`). Exported defaults `DEFAULT_BURST = 20`, `DEFAULT_PER_SECOND = 10`.

- [ ] **Step 1: Write the failing tests**: with `{burst: 3, perSecond: 1}` at `now = 0`, three `allow(0)` calls are `true` and the fourth `false`; `allow(1000)` is `true` again then `false`; after a long idle the bucket never exceeds `burst` (4 calls at `now = 100_000` give `true, true, true, false`); a `now` that goes backwards does not throw or refill.
- [ ] **Step 2: Run** `npx vitest run server/rateLimit.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `RateLimiter`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** (`Net: token-bucket rate limiter`).

---

### Task 5: Protocol handler (`net.ts`)

**Files:**
- Create: `server/net.ts`
- Test: `server/net.test.ts`
- Modify: `FEATURES.md` (tick "Server-authoritative state, personalized snapshots (no hidden-card leaks)" and "Rejoin tokens and seat holding on disconnect")

**Interfaces:**
- Consumes: `parseClientMessage` (Task 1), `RoomRegistry` (Task 3), `Room` (Task 2), `ServerMessage`, `ErrorCode` from `shared/protocol.ts`.
- Produces from `server/net.ts`:
  - `interface Connection { send(msg: ServerMessage): void; close(): void }`
  - `interface Session { readonly conn: Connection; binding: { room: Room; playerId: string } | null }`
  - `interface Net { connect(conn: Connection): Session; message(session: Session, raw: string): void; disconnect(session: Session): void }`
  - `createNet(registry: RoomRegistry, now?: () => number): Net` (`now` defaults to `Date.now`).
- Behaviour of `message` (every reply goes through `conn.send`; a parse failure sends `error bad_message` and does nothing else):
  - `create_room`: `already_in_room` if bound; else create room, add host, bind, send `joined` then `room_state`.
  - `join_room`: `already_in_room` if bound; `room_not_found` if unknown code; room errors pass through; on success bind, send `joined`, then broadcast `room_state` to every connected player of the room.
  - `rejoin`: `bad_token` if unknown; if that player already has a live session, close the old connection and rebind to the new one; mark connected; send `joined`, `room_state`, and `game_state` if the game has started; broadcast `room_state` to the others.
  - `pick_seat` / `ready`: `not_in_room` if unbound; room errors pass through; on success broadcast `room_state`; if the call started the game, also send every connected player their `game_state`.
  - game intents (`play_card`, `play_blind`, `call_truco`, `respond`, `mao11_decision`): `not_in_room` if unbound; room errors pass through as `error`; on success send each `GameEvent` as `{t:'event'}` to every connected player (same events to all), then each connected player their own `game_state`, then `room_state` if status changed.
  - `chat_quick`: `not_in_room` if unbound, `need_seat` if unseated; broadcast `{t:'chat', seat, phraseId}`.
  - `disconnect`: if the session is still the player's current one, mark disconnected and broadcast `room_state`; a stale (replaced) session does nothing.

- [ ] **Step 1: Write the failing tests** in `server/net.test.ts` with a `FakeConn` that records sent messages, a helper `lobbyOf(mode)` that connects N sessions through create/join/pick_seat/ready, and a seeded registry (`seed: () => 1`). Tests:
  - create → receives `joined` (non-empty `token`, 4-char `code`) then `room_state` with `you` equal to its own id and `host: true`;
  - join with a lowercase code works and the host receives an updated `room_state` with two players; join `ZZZZ` → `room_not_found`; second `create_room` on a bound session → `already_in_room`;
  - garbage (`'not json'`, `'{"t":"nope"}'`) → `bad_message`, session still usable afterwards;
  - `pick_seat` / `ready` / `play_card` before joining → `not_in_room`;
  - 2-player flow: both pick seats and ready → each receives exactly one `game_state` whose `view.seat` is its own seat;
  - **leak test (4 players):** after the game starts and after one played card, for each connection: every `game_state` has `players[s].cards === null` for every seat `s` other than its own (or its team's during a mão de onze), and the JSON of all its messages contains none of the card ids that appear in the other connections' own-seat `cards` (compare against ids that are in no public place: the vira and cards on the table are public and excluded); no `event` carries a `card` for a face-down play.
  - a legal `play_card` by the player on turn sends an `event` `card_played` to all connections and updated `game_state` to all; an illegal play (wrong turn) sends `error illegal_intent` only to the sender and no `game_state` to anyone;
  - disconnect mid-game: others receive `room_state` with that player `connected: false`; `rejoin` with its token on a new `FakeConn` receives `joined`, `room_state`, `game_state` with the same hand as before; the others see `connected: true` again;
  - **takeover:** `rejoin` with the same token from a second conn while the first is still live → the first conn's `close` was called, the second receives the snapshot, and later `disconnect(firstSession)` does not mark the player disconnected;
  - `rejoin` with `'nope'` → `bad_token`;
  - `chat_quick` with a seat broadcasts `chat` to all; before picking a seat → `need_seat`.
- [ ] **Step 2: Run** `npx vitest run server/net.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `createNet` in `server/net.ts`. Keep a `Map<playerId-per-room, Session>`-style lookup inside the closure (a `WeakMap<Room, Map<string, Session>>`) so broadcasts reach only live sessions. Never log message payloads.
- [ ] **Step 4: Run** `npx vitest run server/net.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** (`Net: protocol handler with personalized snapshots and rejoin`).

---

### Task 6: WebSocket server, heartbeat, wiring

**Files:**
- Create: `server/ws.ts`
- Test: `server/ws.test.ts`
- Modify: `server/index.ts` (attach after `http.createServer(app)`; clear timers on shutdown)
- Modify: `FEATURES.md` (tick "Ping/pong heartbeat every 15s")

**Interfaces:**
- Consumes: `createNet`, `Connection` (Task 5), `RoomRegistry`, `LOBBY_GRACE_MS` (Task 3), `RateLimiter` (Task 4), `HEARTBEAT_INTERVAL_MS`, `MAX_MESSAGE_BYTES` (Task 1).
- Produces from `server/ws.ts`:
  - `interface WsOptions { heartbeatMs?: number; sweepMs?: number; registry?: RoomRegistry; burst?: number; perSecond?: number }`
  - `attachWebSocket(httpServer: http.Server, opts?: WsOptions): { close(): Promise<void> }` — a `ws` `WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })` plus a manual `upgrade` listener that handles only `/ws` and ignores other paths (so Vite's HMR upgrade in dev keeps working). Per socket: text frames are passed to `net.message` after `RateLimiter.allow`; a rejected message gets `error rate_limited` (not processed); binary frames get `error bad_message`. Heartbeat: every `heartbeatMs` (default 15 s) terminate sockets that did not answer the previous `ping` with `pong`, then ping the rest. A sweep timer every `sweepMs` (default 5 s) calls `registry.sweep(Date.now())` and broadcasts nothing. `close()` clears both timers and closes all sockets and the server. On socket `close`/`error`, call `net.disconnect`.

- [ ] **Step 1: Write the failing integration tests** in `server/ws.test.ts` using a real `http.Server` on port 0 and `ws` clients (helper that opens a client and returns a function awaiting the next message of a given `t`):
  - client connects to `/ws`, sends `create_room`, receives `joined` and `room_state`; two clients complete a 2-player lobby and both receive `game_state`;
  - a client connecting to `/other` is rejected (connection error / 4xx);
  - non-JSON text and a binary frame each yield `error bad_message` and the socket stays open; a frame over `MAX_MESSAGE_BYTES` closes the socket (ws code 1009) without crashing the server;
  - rate limit: with `{burst: 3, perSecond: 0.001}`, sending 6 `ready` messages quickly yields at least one `error rate_limited`;
  - heartbeat: with `heartbeatMs: 50`, a client whose `pong` is suppressed (`client.pong = () => {}` and `autoPong: false`) is terminated within 300 ms, while a normal client stays connected for 300 ms;
  - rejoin over the wire: client A creates a room, joins B, A's socket is terminated, a new socket sends `rejoin` with A's token and receives `joined`;
  - `close()` resolves and leaves no open handles (the test ends without hanging).
- [ ] **Step 2: Run** `npx vitest run server/ws.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `attachWebSocket` in `server/ws.ts`, then call it from `server/index.ts` and call its `close()` in the existing signal handler. Handle upgrade only for `/ws`.
- [ ] **Step 4: Run** `npm run check`, then start `npm run dev`, confirm the banner still prints and Vite HMR still connects (open `http://localhost:3000` and watch the dev server console for no upgrade errors). Expected: `check` all green.
- [ ] **Step 5: Commit** (`Net: WebSocket server with heartbeat and rate limiting`).
