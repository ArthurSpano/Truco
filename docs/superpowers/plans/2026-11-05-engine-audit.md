# Engine Coverage Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the last unchecked box of `FEATURES.md` section 2 ("Vitest coverage and a harness simulating full 2/4/6 player games") by proving every coverage item in the spec is tested, and adding any test that is missing.

**Architecture:** An audit, not a feature. The engine and `engine/simulate.ts` harness already exist; this plan maps each required test topic to a test file and fills gaps.

**Tech Stack:** Vitest, TypeScript strict.

**Spec:** `CLAUDE.md` §3 "Engine requirements".

## Global Constraints

- Engine stays pure: no I/O, no imports from `server/` or `client/`; no `any` in `engine/`.
- Seeded RNG for deterministic tests.
- Do not change engine behaviour. If an audit test fails because of a real rule bug, stop and report it; do not "fix" the test to match.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A topic that is only covered by the random-play harness and never by a hand-written assertion (the harness checks invariants, not exact outcomes). [Task 1]
2. Tie rules checked only in 2 players but never with 4 or 6 players' trick winners. [Task 1]

---

### Task 1: Map the spec's coverage list to tests and fill gaps

**Files:**
- Create: `docs/engine-coverage.md` (a table: topic → test file → test name)
- Modify: whichever `engine/*.test.ts` lacks a topic
- Modify: `FEATURES.md` (tick the box)

**Interfaces:**
- Consumes: existing engine tests (`engine/deck.test.ts`, `tricks.test.ts`, `hand.test.ts`, `truco.test.ts`, `maoDeOnze.test.ts`, `maoDeFerro.test.ts`, `match.test.ts`, `seating.test.ts`, `simulate.test.ts`) and `scripts/simulate.ts`.
- Produces: `docs/engine-coverage.md`.

- [ ] **Step 1: Build the table.** One row per topic, each pointing to an existing test by file and `it(...)` title: manilha wrap-around (vira 3 → manilha 4); suit order zap > copas > espadilha > pica-fumo; trick 1 tied then trick 2 decides; trick 1 and 2 tied then trick 3 decides; all three tied → team of the *mão* wins; trick 1 won + trick 2 tied → trick-1 winner; 1-1 and trick 3 tied → trick-1 winner; truco ladder accept; run (scores the pre-raise value, 1 for the first truco); raise; only the team that did not make the latest raise may raise; 4/6 players: any member of the answering team may answer; mão de onze play and run; mão de ferro (blind, no truco, worth 1); face-down card loses to any face-up card and is not shown by `viewFor`; win at 12; seat order and partners for 2, 4 and 6 players.
- [ ] **Step 2: For each row with no direct assertion, write the failing-then-passing test** in the matching file. For tie rules, include at least one case each for 4 and 6 players. Run `npx vitest run engine/<file>.test.ts`. Expected: PASS. A test that fails against unchanged engine code is a finding to report, not to patch.
- [ ] **Step 3: Run the harness** `npm run simulate -- --help` to read its options, then run it for 200 matches in each of modes 2, 4 and 6 with a fixed seed. Expected: exit code 0 and zero invariant violations. Record the command in `docs/engine-coverage.md`.
- [ ] **Step 4: Run** `npm run check`. Expected: all green.
- [ ] **Step 5: Tick** "Vitest coverage and a harness simulating full 2/4/6 player games" in `FEATURES.md` and commit `git add docs/engine-coverage.md engine FEATURES.md && git commit -m "Engine: coverage audit against the spec"`.
