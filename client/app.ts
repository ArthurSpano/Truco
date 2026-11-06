import type { ClientMessage, RoomState } from '../shared/protocol.js';
import type { GameView, ServerInfo } from '../shared/types.js';
import { GameSocket } from './net/socket.js';
import { localTokenStore } from './net/tokenStore.js';
import { initialState, reduce } from './state/reducer.js';
import type { Action, AppState } from './state/reducer.js';
import { createHome } from './ui/home.js';
import type { HomeView } from './ui/home.js';
import { renderLobby } from './ui/lobby.js';
import { el } from './ui/dom.js';
import type { ScreenView } from './ui/screen.js';
import { createHandStore } from './ui/handFan.js';
import { renderTable } from './ui/table.js';
import { tableModel } from './ui/tableModel.js';

type Screen = 'home' | 'lobby' | 'table' | 'waiting' | 'replaced';

function screenOf(state: AppState, replaced: boolean): Screen {
  if (replaced) return 'replaced';
  if (!state.room) return 'home';
  if (state.room.status === 'lobby') return 'lobby';
  return state.view ? 'table' : 'waiting';
}

/** A panel that never changes after it is built. */
function staticScreen(element: HTMLElement): ScreenView {
  return { element, update: () => undefined, destroy: () => undefined };
}

const REPLACED_TEXT = 'Esta sala foi aberta em outra aba/aparelho. Recarregue para voltar.';

/** Wires socket, state store and screens together. */
export function startApp(root: HTMLElement): void {
  let state = initialState();
  let info: ServerInfo | null = null;
  let replaced = false;
  let infoFailed = false;
  let urlCode: string | null = null;
  let screen: Screen | null = null;
  let home: HomeView | null = null;
  let current: ScreenView | null = null;

  const header = el('header', 'sign');
  header.append(el('h1', 'neon', 'Truco de Boteco'));
  header.append(el('p', 'tagline', 'Truco Paulista com a galera, na mesma rede.'));
  const banner = el('p', 'banner');
  banner.setAttribute('role', 'status');
  banner.hidden = true;
  const main = el('div', 'screen');
  root.replaceChildren(header, banner, main);

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const tokens = localTokenStore();
  const socket = new GameSocket({
    url: `${proto}://${location.host}/ws`,
    tokens,
    onMessage: (msg) => {
      dispatch({ kind: 'server', msg, now: Date.now() });
    },
    onStatus: (status) => {
      dispatch({ kind: 'conn', status });
    },
    onReplaced: () => {
      replaced = true;
      render();
    },
  });

  // User actions clear any old error so it cannot linger over the next attempt.
  const send = (m: ClientMessage): void => {
    if (state.error) dispatch({ kind: 'clear_error' });
    socket.send(m);
  };

  /**
   * Leaves the current room (client-only: there is no leave message). Forgets the token,
   * resets state, strips ?sala= and reconnects so the server sees a fresh session; it frees
   * the abandoned lobby seat after its 30s disconnect grace.
   */
  function leave(): void {
    tokens.clear();
    syncUrl(null); // before the reset so the rebuilt home screen does not prefill the old code
    dispatch({ kind: 'reset' });
    socket.connect();
  }

  function dispatch(action: Action): void {
    state = reduce(state, action);
    render();
  }

  function render(): void {
    updateBanner();
    const next = screenOf(state, replaced);
    // Only follow a live room; a dropped room (bad_token) keeps the URL so an invite survives.
    if (state.room) syncUrl(state.room.code);
    if (next !== screen) {
      current?.destroy();
      current = null;
      home = null;
    }
    if (next === 'replaced') {
      if (!current) {
        const box = el('section', 'panel');
        box.append(el('p', 'error', REPLACED_TEXT));
        current = staticScreen(box);
        main.replaceChildren(box);
      }
    } else if (next === 'home') {
      if (!home) {
        home = createHome(state, send);
        current = home;
        main.replaceChildren(home.element);
      } else {
        home.update(state);
      }
    } else if (next === 'lobby') {
      // The lobby is re-rendered wholesale on every state change.
      const element = renderLobby(state, info, send, infoFailed, leave);
      current = staticScreen(element);
      main.replaceChildren(element);
    } else if (next === 'waiting') {
      const box = el('section', 'panel');
      const seated = state.room?.players.some((p) => p.id === state.room?.you && p.seat !== null);
      box.append(
        el(
          'p',
          'muted',
          seated ? 'Distribuindo as cartas…' : 'Você está assistindo — esta mesa já começou.',
        ),
      );
      if (!seated) {
        const exit = el('button', 'btn', 'Voltar ao início');
        exit.type = 'button';
        exit.addEventListener('click', leave);
        box.append(exit);
      }
      current = staticScreen(box);
      main.replaceChildren(box);
    } else {
      if (!current) current = createTableScreen();
      current.update(state);
    }
    header.hidden = next === 'table';
    root.classList.toggle('table-mode', next === 'table');
    screen = next;
  }

  /** Table screen: rebuilt from each new snapshot, nothing outside its element to release yet. */
  function createTableScreen(): ScreenView {
    const element = el('div', 'table-screen');
    main.replaceChildren(element);
    let shownView: GameView | null = null;
    let shownRoom: RoomState | null = null;
    const hand = createHandStore();
    return {
      element,
      update(next) {
        if (!next.view || !next.room) return;
        if (next.view === shownView && next.room === shownRoom) return;
        shownView = next.view;
        shownRoom = next.room;
        const model = tableModel(next.view, next.room);
        element.replaceChildren(
          renderTable(model, {
            hand,
            onPlay: (cardId, faceDown) => {
              send({ t: 'play_card', cardId, faceDown });
            },
            onLeave: leave,
          }),
        );
      },
      destroy() {
        element.replaceChildren();
      },
    };
  }

  /** Keeps ?sala= in step with the room; only touches history when the code changes. */
  function syncUrl(code: string | null): void {
    if (code === urlCode) return;
    urlCode = code;
    try {
      history.replaceState(null, '', code ? `?sala=${code}` : location.pathname);
    } catch {
      // Browsers may throttle history updates; the URL is only a convenience.
    }
  }

  function updateBanner(): void {
    if (replaced) {
      banner.hidden = true;
    } else if (state.conn !== 'open') {
      banner.textContent = state.conn === 'connecting' ? 'Conectando…' : 'Reconectando…';
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  render();
  socket.connect();
  void fetch('/api/info')
    .then((res) => (res.ok ? (res.json() as Promise<ServerInfo>) : null))
    .then((data) => {
      info = data;
      infoFailed = data === null;
      if (screen === 'lobby') render();
    })
    .catch(() => {
      infoFailed = true;
      if (screen === 'lobby') render();
    });
}
