import type { ClientMessage } from '../shared/protocol.js';
import type { ServerInfo } from '../shared/types.js';
import { GameSocket } from './net/socket.js';
import { localTokenStore } from './net/tokenStore.js';
import { initialState, reduce } from './state/reducer.js';
import type { Action, AppState } from './state/reducer.js';
import { createHome } from './ui/home.js';
import type { HomeView } from './ui/home.js';
import { renderLobby } from './ui/lobby.js';

type Screen = 'home' | 'lobby' | 'table' | 'replaced';

function screenOf(state: AppState, replaced: boolean): Screen {
  if (replaced) return 'replaced';
  if (!state.room) return 'home';
  return state.room.status === 'lobby' ? 'lobby' : 'table';
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const REPLACED_TEXT = 'Esta sala foi aberta em outra aba/aparelho. Recarregue para voltar.';

/** Wires socket, state store and screens together. */
export function startApp(root: HTMLElement): void {
  let state = initialState();
  let info: ServerInfo | null = null;
  let replaced = false;
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
      dispatch({ kind: 'server', msg, now: Date.now() });
      // A rejected rejoin means the old session is gone: drop any stale room.
      if (msg.t === 'error' && msg.code === 'bad_token') {
        state = { ...state, room: null, view: null, code: null, token: null };
        render();
      }
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
    const code = state.room?.code;
    if (code) history.replaceState(null, '', `?sala=${code}`);
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
      main.replaceChildren(renderLobby(state, info, send));
    } else if (screen !== 'table') {
      home = null;
      const box = el('section', 'panel');
      box.append(el('p', 'muted', 'Mesa em construção'));
      main.replaceChildren(box);
    }
    screen = next;
  }

  function updateBanner(): void {
    if (replaced) {
      banner.hidden = true;
    } else if (state.conn !== 'open') {
      banner.textContent = 'Reconectando…';
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
      if (screen === 'lobby') render();
    })
    .catch(() => undefined);
}
