# Scene Themes (Taverna / Praça / Gramado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each player switch the table scene between three backgrounds (the existing wooden *Taverna*, a concrete public-park *Praça*, and a *Gramado* lawn), each with its own colour-grading filter and a table/chairs restyled for that setting, while the HUD, hand, cards and action bar stay exactly as they are.

**Architecture:** A pure `sceneTheme.ts` module owns the theme ids, cycling and a `localStorage`-backed store (tested in node). The table screen puts a `theme-<id>` class on its root and a persistent `.backdrop` layer (floor + floor-level props) behind the stage; every theme is a CSS file that restyles only the scenery selectors (`.backdrop`, `.rugc`, `.chair`, `.rim`, `.felt`, `.fring`, `.glow`) under `.theme-<id>`. The choice is per viewer (no protocol or server change), switched by a 44px button under the mute button.

**Tech Stack:** TypeScript strict, vanilla DOM, CSS (gradients only, no image files), Vitest (node environment).

**Spec:** User request (2026-11-12): "Create multiple backgrounds for the game, apply filters, keep the UI: public park floor (concrete), grass floor; for each, change the table according to the context." Plus `CLAUDE.md` §4 (visual direction, mobile rules) and §6 (conventions).

## Global Constraints

- Theme ids, in cycle order: `taverna` (default, the current look), `praca`, `gramado`. pt-BR labels: `Taverna`, `Praça`, `Gramado`.
- "Keep the UI": `.score`, `.mid-hud`, `.vira`, `.status`, hand, action bar, bubbles, dialogs, played cards and card backs are never filtered or restyled by a theme. Theme CSS may only target `.backdrop` and its children, `.rugc`, `.chair`, `.rim`, `.felt`, `.fring`, `.glow` and the root `--grade` variable.
- The `taverna` theme must render pixel-identical to today: no existing rule in `scene.css`/`base.css` changes value; new rules are scoped to `.theme-praca` / `.theme-gramado`.
- Art is drawn with CSS gradients/borders only (no image files, no copied assets, no brands). Lengths are design px times `var(--u)` on the 390 x 844 artboard, as in `scene.css`.
- Choice is stored per viewer in `localStorage` key `truco.scene`; blocked storage must never throw (same pattern as `client/audio/sfx.ts`).
- Touch: theme button is ≥ 44 real px (`max(44px, calc(44 * var(--u)))`), `type="button"`, has a pt-BR `aria-label`.
- No new dependencies in `package.json`. No server, shared or engine changes.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `npm run check` passes after every task.

## Review Focus

1. Garbage or stale value in `localStorage['truco.scene']` (e.g. `"beach"`, `""`) → falls back to `taverna`, no exception. [Task 1 test]
2. `localStorage` throws (Safari private mode, blocked storage) → game still renders with `taverna`, toggling still works for the session. [Task 1 test]
3. Played cards on the felt get the theme's filter and look washed out / tinted → `.felt` has `filter: none` in the new themes; cards stay crisp. [Task 2 CSS guard test + Task 5 screenshots]
4. Switching theme mid-hand must not rebuild the scene, drop the selected card or replay animations → switching only swaps a class and the backdrop node. [Task 2: `update()` untouched; Task 5 manual check]
5. A theme added to `SCENE_THEMES` without a stylesheet (or a stylesheet that touches HUD selectors) → caught by the CSS guard test. [Task 2 test]

## Model assignment (for subagent-driven execution)

| Task | Implementer | Why |
|---|---|---|
| 1 Theme model + store | `haiku` | Small pure module, fully pinned by tests |
| 2 Plumbing (backdrop, class, button, guard test) | `sonnet` | Touches several files; must keep `update()` semantics |
| 3 Praça theme CSS | `opus` | Visual craft, judgment on composition and legibility |
| 4 Gramado theme CSS | `opus` | Same |
| 5 Screenshot verification + docs | `sonnet` | Mechanical harness + careful looking |

Spec/quality reviewers per task: `sonnet`. Final whole-branch review: `opus`.

---

### Task 1: Theme model and store

**Files:**
- Create: `client/ui/sceneTheme.ts`
- Test: `client/ui/sceneTheme.test.ts`

**Interfaces:**
- Produces (all from `client/ui/sceneTheme.ts`):
  - `export const SCENE_THEMES = ['taverna', 'praca', 'gramado'] as const;`
  - `export type SceneTheme = (typeof SCENE_THEMES)[number];`
  - `export const THEME_LABEL: Record<SceneTheme, string>` = `{ taverna: 'Taverna', praca: 'Praça', gramado: 'Gramado' }`
  - `export const THEME_ICON: Record<SceneTheme, string>` = `{ taverna: '🍺', praca: '🌳', gramado: '🌿' }`
  - `export function parseTheme(raw: string | null | undefined): SceneTheme` — unknown → `'taverna'`.
  - `export function nextTheme(t: SceneTheme): SceneTheme` — cycles in `SCENE_THEMES` order, wraps.
  - `export interface ThemeStore { get(): SceneTheme; set(t: SceneTheme): void }`
  - `export function createThemeStore(storage?: Pick<Storage, 'getItem' | 'setItem'>): ThemeStore` — default argument is a `browserStorage()` helper identical in spirit to the one in `client/audio/sfx.ts` (returns `undefined` when `localStorage` access throws or is absent). Key `'truco.scene'`. Reads once at creation; `set` updates the in-memory value first, then writes in a `try/catch`.

- [ ] **Step 1: Write the failing tests** in `client/ui/sceneTheme.test.ts`:

```ts
describe('parseTheme', () => {
  it('accepts every known id', () => { for (const t of SCENE_THEMES) expect(parseTheme(t)).toBe(t); });
  it('falls back to taverna', () => {
    for (const raw of [null, undefined, '', 'beach', 'PRACA']) expect(parseTheme(raw)).toBe('taverna');
  });
});
describe('nextTheme', () => {
  it('cycles and wraps', () => {
    expect(nextTheme('taverna')).toBe('praca');
    expect(nextTheme('praca')).toBe('gramado');
    expect(nextTheme('gramado')).toBe('taverna');
  });
});
describe('createThemeStore', () => {
  // fake: a Map-backed { getItem, setItem }
  it('defaults to taverna on empty storage');            // get() === 'taverna'
  it('persists under truco.scene and reads it back');    // set('gramado'); map.get('truco.scene') === 'gramado'; new store over same map → get() === 'gramado'
  it('ignores a garbage stored value');                  // map 'truco.scene' = 'beach' → get() === 'taverna'
  it('survives a storage that throws');                  // getItem/setItem throw → get() === 'taverna'; set('praca') does not throw; get() === 'praca'
});
```

- [ ] **Step 2: Run** `npx vitest run client/ui/sceneTheme.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `client/ui/sceneTheme.ts` per the Interfaces block.
- [ ] **Step 4: Run** `npx vitest run client/ui/sceneTheme.test.ts` — Expected: PASS. Then `npm run check` — Expected: exit 0.
- [ ] **Step 5: Commit** — `git add client/ui/sceneTheme.ts client/ui/sceneTheme.test.ts && git commit -m "Scene themes: theme model and persisted store"`

---

### Task 2: Theme plumbing — backdrop layer, theme class, switch button, CSS guard

**Files:**
- Create: `client/ui/backdrop.ts`, `client/ui/themeButton.ts`, `client/styles/themes/praca.css`, `client/styles/themes/gramado.css` (placeholder floors only; Tasks 3–4 fill them), `client/styles/themes.test.ts`
- Modify: `client/ui/tableScreen.ts` (`createTableScreen`), `client/styles/scene.css` (append only), `client/main.ts` (imports), `client/ui/tableScreen.ts` doc comment (layout tree)

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - `client/ui/backdrop.ts`: `export function renderBackdrop(theme: SceneTheme): HTMLElement` → `<div class="backdrop" aria-hidden="true"><div class="props">…</div></div>`. `.props` children are empty `div`s whose class names are the theme's prop list: `praca`: `['shade s1', 'shade s2', 'shade s3', 'leaf l1', 'leaf l2', 'leaf l3', 'leaf l4', 'grate']`; `gramado`: `['shade s1', 'shade s2', 'flowers f1', 'flowers f2', 'flowers f3', 'cooler', 'blanket']`; `taverna`: none. Export the lists as `export const THEME_PROPS: Record<SceneTheme, readonly string[]>` so CSS authors and tests share them.
  - `client/ui/themeButton.ts`: `export function renderThemeButton(store: ThemeStore, onChange: (t: SceneTheme) => void): HTMLElement` — `<button type="button" class="theme-btn">` showing `THEME_ICON[current]`; `aria-label` = `Cenário: ${THEME_LABEL[current]}. Trocar`; `title` same. Click → `t = nextTheme(store.get())`, `store.set(t)`, repaint, `onChange(t)`.
  - `createTableScreen` (unchanged signature): creates `const themes = createThemeStore()`; root element classes become `table-screen v1 floor theme-${theme}`; DOM order `element.append(backdrop, stage, glow, overlayHost, themeButton)`. `applyTheme(t)` (local function) swaps the `theme-*` class and `backdrop.replaceWith(renderBackdrop(t))`. It never touches `sceneHost`, `latch`, `hand`, or the animator — `update()` stays byte-identical.

- [ ] **Step 1: Write the failing CSS guard test** `client/styles/themes.test.ts` (node `fs`, reads files relative to `import.meta.url`):

```ts
it('every non-default theme has a stylesheet scoped to its class', () => {
  for (const t of SCENE_THEMES.filter((t) => t !== 'taverna')) {
    const css = readCss(`themes/${t}.css`);
    expect(css).toContain(`.theme-${t}`);
  }
});
it('theme stylesheets never touch HUD or card selectors', () => {
  const banned = ['.score', '.mid-hud', '.vira', '.status', '.hand', '.action', '.bubble', '.tc', '.c ', '.bk', '.backs', '.pl', '.av', '.nm'];
  for (const t of ['praca', 'gramado']) {
    const css = stripComments(readCss(`themes/${t}.css`));
    for (const b of banned) expect(css, `${t} uses ${b}`).not.toContain(b);
  }
});
it('new themes leave the felt unfiltered so played cards stay crisp', () => {
  for (const t of ['praca', 'gramado']) {
    expect(stripComments(readCss(`themes/${t}.css`))).toMatch(new RegExp(`\\.theme-${t} \\.felt\\s*\\{[^}]*filter:\\s*none`));
  }
});
it('every prop in THEME_PROPS is styled by its theme', () => {
  for (const t of ['praca', 'gramado'] as const) {
    const css = readCss(`themes/${t}.css`);
    for (const p of THEME_PROPS[t]) for (const cls of p.split(' ')) expect(css).toContain(`.${cls}`);
  }
});
```

(`.c ` with the trailing space and `.bk` are card classes from `cards.css`; if a legitimate theme selector collides with a banned substring, rename the theme selector, not the test.)

- [ ] **Step 2: Run** `npx vitest run client/styles/themes.test.ts` — Expected: FAIL (files / `THEME_PROPS` missing).
- [ ] **Step 3: Implement** `backdrop.ts`, `themeButton.ts`, the tableScreen wiring, and these CSS pieces:
  - Append to `scene.css` (after existing rules, do not edit existing ones): `.v1 .backdrop { position:absolute; inset:0; z-index:0; pointer-events:none; filter: var(--grade, none); }` and `.v1 .props { position:absolute; left:var(--stage-x); top:var(--stage-y); width:calc(390*var(--u)); height:calc(844*var(--u)); }`; `.v1 .stage` gets no change (it already sits above as a later sibling — verify stacking; add `z-index: 0` to `.backdrop` only).
  - `.theme-btn` in `scene.css`: copy the visual of `.mute-btn` in `base.css` (glass bg, cream 3px border, round) at `position: fixed; z-index: 25; top: calc(var(--stage-y) + 144 * var(--u)); right: calc(var(--stage-x) + 14 * var(--u)); width/height: max(44px, calc(44 * var(--u)))`.
  - Each of `themes/praca.css` / `themes/gramado.css`: a scoped placeholder — `.v1.theme-<t> .backdrop` solid floor colour (`#9a9a94` / `#4f8a3a`), `.v1.theme-<t> .felt { filter: none; }`, and an empty-bodied-but-valid rule per prop class (e.g. `.v1.theme-<t> .props .shade {}` — Prettier may collapse; a `display: block;` declaration is fine). Tasks 3–4 replace the bodies.
  - `client/main.ts`: import `./styles/themes/praca.css` and `./styles/themes/gramado.css` right after `scene.css`.
- [ ] **Step 4: Run** `npx vitest run client/styles/themes.test.ts client/ui/sceneTheme.test.ts` — Expected: PASS. `npm run check` — Expected: exit 0. `npm run build` — Expected: exit 0.
- [ ] **Step 5: Commit** — `git commit -m "Scene themes: backdrop layer, theme class and switch button"`

---

### Task 3: Praça theme — concrete park floor, concrete game table

**Files:**
- Modify: `client/styles/themes/praca.css` (only this file)

**Interfaces:**
- Consumes: root class `.v1.theme-praca`; `.backdrop > .props` children with classes from `THEME_PROPS.praca` (Task 2); scenery nodes `.rugc`, `.chair.t1/.t2/.mine/.away`, `.table > .rim`, `.felt`, `.fring`, `.glow` from `client/ui/scene.ts` / `tableScreen.ts`. Geometry: table box 30,245 → 360,575 (design px); chair positions per mode are in `client/ui/layout.ts` (`chair: {x,y,w,h,rot}`).
- Produces: nothing consumed by code.

Art direction (daytime public square, Brazilian *praça*):

| Element | Treatment |
|---|---|
| `--grade` (on `.v1.theme-praca`) | Overcast daylight: `brightness(1.06) contrast(1.04) saturate(0.88)`. Applied via `filter: var(--grade)` to `.backdrop` (already, Task 2), `.rugc`, `.rim` and `.chair` — never to `.felt`. |
| `.backdrop` | Light grey poured-concrete slabs: ~124u square slabs with 3u darker expansion joints, two-tone slab variation, fine speckle (`repeating-radial-gradient` aggregate), a faint sun wash top-left. Background attaches to `.backdrop` (not `fixed`). |
| `.props .shade.s1-s3` | Large soft dark-green/blue-grey blobs (tree canopy shadows) bleeding off the stage edges (e.g. top-left, right-middle, bottom-left), `border-radius: 50%`, blurred edges via radial gradient, opacity ≤ 0.35. |
| `.props .leaf.l1-l4` | Small (14–22u) fallen leaves in ochre/brown/olive, rotated, scattered in the four corners outside the table box. |
| `.props .grate` | A small square drain grate (bueiro) near a bottom corner: dark slots via `repeating-linear-gradient`. |
| `.rugc` | Becomes the concrete table's pedestal shadow: no stripes, no border; soft dark radial `rgb(30 30 35 / 0.35)` ellipse, slightly offset down-right. |
| `.rim` | Thick cast-concrete top edge: warm grey with aggregate speckle, chamfer highlight (inset light top, inset dark bottom), keep the 5u `var(--ink)` outline for the cartoon style. |
| `.felt` | Smoother polished-concrete/granilite top (lighter, faint terrazzo chips), with an 8 × 8 inlaid checkerboard (tabuleiro de dama) at ≤ 0.18 opacity centred so cards stay readable. `filter: none`. |
| `.fring` | Painted ring in faded white `rgb(255 255 255 / 0.35)`, solid (not dashed). |
| `.chair` | Fixed round concrete stools: `border-radius: 50%`, concrete fill; team shown by a 7u painted ring in the team colours already used (`#d98d2b` for `.t1`, `#8e1f2a` for `.t2`) replacing the dashed `::after`. `.away` still desaturates. `filter: var(--grade)`. |
| `.glow` | Lighter, cooler vignette: `radial-gradient(ellipse at 50% 50%, transparent 55%, rgb(20 28 36 / 0.45) 100%)`. |

- [ ] **Step 1:** Replace the Task 2 placeholder bodies with the treatment above. Keep every selector prefixed `.v1.theme-praca` and stay within the allowed selectors (Global Constraints).
- [ ] **Step 2: Verify** `npx vitest run client/styles/themes.test.ts` — PASS; `npm run check` — exit 0.
- [ ] **Step 3: Visual check:** `npm run dev`, open two browser tabs at `http://localhost:3000`, create a 2-player room, join with the second tab, ready both, set the theme to Praça with the button. Check at 360 × 640 and desktop: cards on the felt and the vira are as legible as in Taverna; no prop overlaps the hand or the HUD in a way that hurts reading. (If no browser is available in the session, say so in the report — Task 5 screenshots will cover it.)
- [ ] **Step 4: Commit** — `git commit -m "Scene themes: Praça (concrete park) floor and table"`

---

### Task 4: Gramado theme — lawn floor, cable-spool table with checkered cloth

**Files:**
- Modify: `client/styles/themes/gramado.css` (only this file)

**Interfaces:** same as Task 3, with `.v1.theme-gramado` and `THEME_PROPS.gramado`.

Art direction (sunny backyard lawn, a churrasco afternoon):

| Element | Treatment |
|---|---|
| `--grade` | Warm late-afternoon sun: `saturate(1.18) brightness(1.03) sepia(0.08)`. Same targets as Praça: `.backdrop`, `.rugc`, `.rim`, `.chair`; never `.felt`. |
| `.backdrop` | Mown lawn: alternating light/dark green stripes ~70u wide (diagonal, ~-12deg), fine blade texture (thin repeating gradients), a few darker clover patches, warm sun wash top-right. |
| `.props .shade.s1-s2` | Soft tree-canopy shadows off the top-right and bottom-left edges, opacity ≤ 0.3. |
| `.props .flowers.f1-f3` | Tiny clusters (3–5 dots, 6–8u) of white/yellow daisies in corners outside the table box. |
| `.props .blanket` | Corner of a picnic blanket (red/cream gingham) peeking from the bottom-left stage edge, rotated, mostly off-stage. |
| `.props .cooler` | Small styrofoam cooler (isopor) seen from above: off-white rounded rect with lid seam, near the top-left outside the table box, with a short shadow. No brand marks. |
| `.rugc` | Table shadow on grass: no stripes, no border; soft `rgb(10 40 10 / 0.35)` radial, offset down-right. |
| `.rim` | Cable-spool (carretel) flange: light plywood with concentric end-grain rings (`repeating-radial-gradient`), 4–6 dark bolt dots near the edge, keep the 5u ink outline. |
| `.felt` | Round red-and-cream checkered tablecloth (toalha xadrez): checks ~22u, muted red `#b5413a` / cream `#f3e6c8` at reduced contrast (cloth overlay ≤ 0.85 opacity over cream) so the white cards with ink outlines remain clearly readable; subtle fold lines. `filter: none`. |
| `.fring` | Cloth hem: solid cream ring 3u, `rgb(255 245 225 / 0.6)`. |
| `.chair` | Folding camping chairs: rounded rect, fabric in team colours (`.t1` amber, `.t2` red, same hues as Taverna), dark aluminium frame as a 4u `#3b3b40` border plus two crossbar stripes; drop the dashed `::after` or turn it into the seat seam. `.away` still desaturates. `filter: var(--grade)`. |
| `.glow` | Warm golden vignette: `radial-gradient(ellipse at 50% 50%, transparent 50%, rgb(40 25 0 / 0.5) 100%)`. |

- [ ] **Step 1:** Replace the Task 2 placeholder bodies with the treatment above, prefix `.v1.theme-gramado`, allowed selectors only.
- [ ] **Step 2: Verify** `npx vitest run client/styles/themes.test.ts` — PASS; `npm run check` — exit 0.
- [ ] **Step 3: Visual check** as in Task 3 Step 3, with Gramado. Pay special attention to card legibility on the checkered cloth; lower the check contrast rather than change card styles.
- [ ] **Step 4: Commit** — `git commit -m "Scene themes: Gramado (lawn) floor and spool table"`

---

### Task 5: Screenshot verification and docs

**Files:**
- Create (scratch only, not committed): a Playwright script in the session scratchpad.
- Modify: `FEATURES.md` (add under "## 7. Polish": `- [x] Scene themes: Taverna, Praça (concreto), Gramado — per-player, persisted`), `README.md` (one short paragraph under the UI/architecture section: themes are pure CSS scoped by a root class; per-viewer choice in `localStorage`, no protocol change).

**Interfaces:** consumes the whole feature; produces screenshots for the human to review.

- [ ] **Step 1: Screenshot harness.** Start `npm run dev` in the background. In the scratchpad, run Playwright via `npx -y playwright@<version matching the cached chromium in ~/.cache/ms-playwright>` (do **not** add it to `package.json`). Two browser contexts: context A creates a room (2 players, then repeat for 4 with four contexts), others join by code, all ready. For each theme, set `localStorage['truco.scene']` and reload (rejoin token restores the seat), or click `.theme-btn`. Capture context A at 360 × 640 and 1280 × 800 → `scratchpad/themes/<mode>p-<theme>-<w>.png`.
- [ ] **Step 2: Inspect** each screenshot (Read the PNGs). Pass criteria: HUD, hand and action bar look identical across themes; the felt and its cards are readable; Taverna matches the pre-feature look (compare against a screenshot taken at `git stash`/the commit before Task 2 if in doubt); the theme button sits under the mute button and does not overlap the vira box.
- [ ] **Step 3: Mid-hand switch check:** in a running hand, select a card, tap `.theme-btn` — the selected card stays selected, no animation replays, no console errors (capture `page.on('console')`).
- [ ] **Step 4:** Update `FEATURES.md` and `README.md`. `npm run check` — exit 0.
- [ ] **Step 5: Commit** — `git commit -m "Scene themes: docs and features checklist"`. Report the screenshot paths (absolute) to the controller.
