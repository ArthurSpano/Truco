import type { ClientMessage } from '../shared/protocol.js';
import type { ServerInfo } from '../shared/types.js';
import { GameSocket } from './net/socket.js';
import { localTokenStore } from './net/tokenStore.js';
import { initialState, reduce } from './state/reducer.js';
import type { Action, AppState } from './state/reducer.js';
import { createHome } from './ui/home.js';
import type { HomeView } from './ui/home.js';
import { renderLobby } from './ui/lobby.js';
import { el } from './ui/dom.js';

type Screen = 'home' | 'lobby' | 'table' | 'replaced';

function screenOf(state: AppState, replaced: boolean): Screen {
  if (replaced) return 'replaced';
  if (!state.room) return 'home';
  return state.room.status === 'lobby' ? 'lobby' : 'table';
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

  const header = el('header', 'sign');
  header.append(el('h1', 'neon', 'Truco de Boteco'));
  header.append(el('p', 'tagline', 'Truco Paulista com a galera, na mesma rede.'));
  const banner = el('p', 'banner');
  banner.setAttribute('role', 'status');
  banner.hidden = true;
  const main = el('main', 'screen');
  root.replaceChildren(header, banner, main);

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new GameSocket({
    url: `${proto}://${location.host}/ws`,
    tokens: localTokenStore(),
    onMessage: (msg) => {
      const dead = msg.t === 'error' && msg.code === 'bad_token';
      // The code in the URL/field points at a room that no longer exists; strip it
      // before rendering so a rebuilt home screen does not prefill it.
      if (dead) {
        urlCode = '';
        syncUrl(null);
      }
      dispatch({ kind: 'server', msg, now: Date.now() });
      if (dead) home?.clearCode();
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

  function dispatch(action: Action): void {
    state = reduce(state, action);
    render();
  }

  function render(): void {
    updateBanner();
    const next = screenOf(state, replaced);
    syncUrl(state.room?.code ?? null);
    if (next === 'replaced') {
      if (screen !== 'replaced') {
        home = null;
        const box = el('section', 'panel');
        box.append(el('p', 'error', REPLACED_TEXT));
        main.replaceChildren(box);
      }
    } else if (next === 'home') {
      if (screen !== 'home' || !home) {
        home = createHome(state, send);
        main.replaceChildren(home.element);
      } else {
        home.update(state);
      }
    } else if (next === 'lobby') {
      home = null;
      main.replaceChildren(renderLobby(state, info, send, infoFailed));
    } else if (screen !== 'table') {
      home = null;
      const box = el('section', 'panel');
      box.append(el('p', 'muted', 'Mesa em construção'));
      main.replaceChildren(box);
    }
    screen = next;
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
