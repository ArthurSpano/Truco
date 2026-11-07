# Truco Flow UI (Milestone 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Speech bubbles for truco calls and answers, the action bar (TRUCO/SEIS/NOVE/DOZE, Aceitar/Correr/Aumentar), and the mão de onze and mão de ferro screens.

**Architecture:** The server already tells each client what it may do (`GameView.actions`) and what just happened (`GameEvent`). This plan maps those to UI with pure functions (`actionBarModel`, `bubbleFor`, `handPhase`) tested in node, then thin DOM components.

**Tech Stack:** Vanilla DOM/CSS, TypeScript strict, Vitest (node).

**Spec:** `CLAUDE.md` §3 (truco ladder, mão de onze, mão de ferro), §4 "Capote-like feel", §5 milestone 6. **Depends on:** the table UI plan (`renderTable`, `tableModel`, `renderHand`).

## Global Constraints

- The client decides nothing about legality: buttons exist only when `view.actions` allows them. The server re-validates every intent.
- Ladder labels: stake 3 → TRUCO, 6 → SEIS, 9 → NOVE, 12 → DOZE. Answers: Aceitar / Correr / Aumentar (the raise button shows the next stake's name).
- In 4/6-player games the prompt is shown to every member of the answering team (the server sets `actions.respond` for each); the first answer wins.
- Mão de onze: the team at 11 sees its partners' cards (own cards only in 2 players) and chooses play (hand worth 3, no truco) or run (opponents get 1). Mão de ferro: both at 11, cards played blind (face down), no truco, worth 1.
- Big, loud bubbles in pt-BR: "TRUCO!", "SEIS!", "NOVE!", "DOZE!", "Corre!", "Aceito!". Min tap target 44px.
- No new dependencies. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; each task ticks its `FEATURES.md` boxes.

## Review Focus

1. Two quick events (a raise answered by a raise) show both bubbles in order, not only the last one. [Task 2]
2. After the opponents call truco, the answering team sees the prompt but the calling team sees "Aguardando resposta" with no buttons. [Task 1]
3. A mão de onze decision for the *other* team shows a waiting message and no other team's cards. [Task 3]
4. In mão de ferro the hand shows backs only and plays by slot (`play_blind`), never by card id. [Task 3]
5. A bubble for a seat that is off the layout (view and room briefly out of sync) is dropped, not thrown. [Task 2]

---

### Task 1: Action bar model and component

**Files:**
- Create: `client/ui/actionBar.ts`, `client/ui/actionBarModel.ts`
- Test: `client/ui/actionBarModel.test.ts`
- Modify: `FEATURES.md` (tick "Action bar: truco/raise button, Aceitar / Correr / Aumentar, face-down toggle")

**Interfaces:**
- Consumes: `GameView`, `GameActions` from `shared/types.ts`.
- Produces from `actionBarModel.ts`:
  - `stakeName(stake: number): string` (3 → `'TRUCO'`, 6 → `'SEIS'`, 9 → `'NOVE'`, 12 → `'DOZE'`; anything else → `String(stake)`).
  - `interface ActionBarModel { call: { label: string; stake: number } | null; respond: { raise: { label: string; stake: number } | null } | null; waiting: string | null; banner: string | null }`
  - `actionBarModel(view: GameView, names: (seat: number) => string): ActionBarModel` — `call` from `actions.callTruco`; `respond` from `actions.respond` (raise label e.g. `'Aumentar para SEIS'`); `banner` while `view.truco` is set, e.g. `"Ana pediu TRUCO!"`; `waiting` (`'Aguardando resposta…'`) when `view.truco` exists, belongs to the viewer's team and `actions.respond` is null, or when a mão de onze decision is pending for the viewer's team's opponents.
- Produces from `actionBar.ts`: `renderActionBar(model: ActionBarModel, send: (m: ClientMessage) => void): HTMLElement` — TRUCO/SEIS/NOVE/DOZE button sends `{t:'call_truco'}`; Aceitar sends `{t:'respond', answer:'accept'}`, Correr `'run'`, Aumentar `'raise'`. The face-down toggle stays in the hand component.

- [ ] **Step 1: Failing tests:** `stakeName` for 3, 6, 9, 12; a view with `actions.callTruco = 3` → `call.label === 'TRUCO'`; with `callTruco = 6` → `'SEIS'`; `callTruco: null` → `call: null`; `actions.respond = { raise: 6 }` → raise label `'Aumentar para SEIS'`; `respond = { raise: null }` (already at 12) → `respond.raise === null`; calling team with `view.truco.team === view.team` and no `respond` → `waiting` set and no buttons; `banner` names the caller via `names`.
- [ ] **Step 2: Run** `npx vitest run client/ui/actionBarModel.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files and mount the bar in `table.ts` under the centre, above the hand.
- [ ] **Step 4: Verify.** `npm run check`; with 4 windows, one player calls truco: both opponents see Aceitar/Correr/Aumentar, partner and caller see "Aguardando resposta…", the first answer clears it for all.
- [ ] **Step 5: Commit** (`Truco: action bar`).

---

### Task 2: Speech bubbles

**Files:**
- Create: `client/ui/bubbles.ts`, `client/ui/bubbleModel.ts`, `client/styles/bubbles.css`
- Test: `client/ui/bubbleModel.test.ts`
- Modify: `client/ui/table.ts` (a bubble layer over the chairs), `client/app.ts` (feed `state.events` to the layer)
- Modify: `FEATURES.md` (tick "Speech bubbles (TRUCO!, SEIS!, NOVE!, DOZE!, Corre!, Aceito!)")

**Interfaces:**
- Consumes: `GameEvent` from `shared/types.ts`; `stakeName` (Task 1); `AppState.events`.
- Produces from `bubbleModel.ts`:
  - `interface Bubble { seat: number; text: string; kind: 'call' | 'accept' | 'run' | 'chat' }`
  - `bubbleFor(event: GameEvent): Bubble | null` — `truco_called` → `text: stakeName(stake) + '!'`, kind `call`; `truco_answered` accept → `'Aceito!'`, run → `'Corre!'`, raise → `stakeName(stake) + '!'` with kind `call`; `mao_de_onze_decided` run → `'Corre!'`, play → `'Vamos jogar!'`; everything else → `null`.
  - `bubblesFor(events: readonly GameEvent[]): Bubble[]` — in order, nulls dropped.
- Produces from `bubbles.ts`: `class BubbleLayer { constructor(host: HTMLElement, anchorOf: (seat: number) => HTMLElement | null); show(b: Bubble): void }` — queues bubbles so two arriving together show one after the other (≈ 900 ms each), positions each next to its seat's chair, auto-removes; unknown seat anchors are skipped. Loud style: large condensed type, outlined, slight tilt, `kind: 'call'` larger than answers.

- [ ] **Step 1: Failing tests:** each of the six texts via `bubbleFor` (`truco_called` stake 3/6/9/12, accept, run); a raise answer at stake 6 → `'SEIS!'`; `card_played` → `null`; `bubblesFor([truco_called seat 1 stake 3, truco_answered seat 2 raise stake 6])` returns two bubbles in that order with seats 1 and 2; mão de onze run → `'Corre!'`.
- [ ] **Step 2: Run** `npx vitest run client/ui/bubbleModel.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files and wire `app.ts` so each `event` message is shown exactly once (track the count already shown, since `state.events` accumulates until the next snapshot).
- [ ] **Step 4: Verify** in a two-window game: TRUCO! appears beside the caller's chair on both screens, then Aceito! or Corre! beside the answerer.
- [ ] **Step 5: Commit** (`Truco: speech bubbles`).

---

### Task 3: Hand phases — mão de onze, mão de ferro, match end

**Files:**
- Create: `client/ui/handPhase.ts`, `client/ui/phaseScreens.ts`
- Test: `client/ui/handPhase.test.ts`
- Modify: `client/ui/table.ts`, `client/ui/hand.ts` (blind mode)
- Modify: `FEATURES.md` (tick "Mão de onze and mão de ferro screens")

**Interfaces:**
- Consumes: `GameView`, `PlayerView`, `Card`.
- Produces from `handPhase.ts`:
  - `type HandPhase = { kind: 'normal' } | { kind: 'mao_de_onze_decide'; hands: { seat: number; cards: Card[] }[] } | { kind: 'mao_de_onze_wait' } | { kind: 'mao_de_ferro' } | { kind: 'over'; won: boolean }`
  - `handPhase(view: GameView): HandPhase` — priority: match over > mão de onze (`decide` when `actions.decideMaoDeOnze`, with the `cards` of every player whose `cards` is non-null, partner hands only; `wait` otherwise) > mão de ferro > normal.
- Produces from `phaseScreens.ts`: `renderMaoDeOnze(phase, send)` — overlay titled "Mão de onze", showing the visible hands, with "Jogar (vale 3)" sending `{t:'mao11_decision', play:true}` and "Correr (eles ganham 1)" sending `play:false`; `renderMaoDeOnzeWait()` — "Os adversários estão decidindo a mão de onze…" with no cards; `renderMaoDeFerroBanner()` — "Mão de ferro: ninguém vê as cartas"; `renderMatchOver(won, onAgain)` — "Vitória!" / "Derrota" with a "Voltar ao início" button.
- Modifies `hand.ts`: `renderHand` gains blind mode (when `actions.playBlind`): shows `cardCount` card backs; tapping slot `i` twice sends `{t:'play_blind', slot: i}` via a new `onPlayBlind(slot)` parameter.

- [ ] **Step 1: Failing tests:** normal view → `normal`; `winner` equal to viewer's team → `{over, won: true}`, other team → `won: false` (over beats every other phase); `maoDeOnze: {team: viewerTeam, decision: 'pending'}` with `actions.decideMaoDeOnze` → `mao_de_onze_decide` listing only players whose `cards` is non-null (2 players: only the viewer's hand; 4 players: viewer and partner); `maoDeOnze` pending for the other team → `mao_de_onze_wait`; `maoDeOnze.decision === 'play'` → falls through to `normal`; `maoDeFerro: true` → `mao_de_ferro`.
- [ ] **Step 2: Run** `npx vitest run client/ui/handPhase.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files and the `hand.ts`/`table.ts` changes.
- [ ] **Step 4: Verify.** Add a dev-only way to reach 11 × 11 without playing for hours: run a unit-level check instead by temporarily starting the server with a debug env `SCORE_PRESET=11,11` handled in the throwaway local branch **only**; do not commit it. Confirm blind play works in two windows, then revert the debug code. `npm run check`.
- [ ] **Step 5: Commit** (`Truco: mão de onze, mão de ferro and match-over screens`).
