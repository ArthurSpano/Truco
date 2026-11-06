import type { ClientMessage } from '../../shared/protocol.js';
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from '../../shared/protocol.js';
import type { AppState } from '../state/reducer.js';
import { canCreate, canJoin, cleanCode, cleanName, loadName, saveName } from './homeForm.js';
import { el } from './dom.js';

type Mode = 2 | 4 | 6;
const MODES: Mode[] = [2, 4, 6];

export interface HomeView {
  element: HTMLElement;
  /** Patches error text, connection hint and button states without touching typed input. */
  update(state: AppState): void;
  destroy(): void;
}

/** Home screen: pick a name, then create a table or join one by code. */
export function renderHome(state: AppState, send: (m: ClientMessage) => void): HTMLElement {
  return createHome(state, send).element;
}

export function createHome(initial: AppState, send: (m: ClientMessage) => void): HomeView {
  let state = initial;
  const root = el('section', 'panel home');
  let mode: Mode = 4;

  const nameLabel = el('label', 'field');
  nameLabel.append(el('span', 'field-label', 'Seu nome'));
  const nameInput = el('input', 'input');
  nameInput.type = 'text';
  nameInput.maxLength = MAX_NAME_LENGTH;
  nameInput.autocomplete = 'off';
  nameInput.enterKeyHint = 'next';
  nameInput.placeholder = 'Ex.: Zé';
  nameInput.value = loadName();
  nameLabel.append(nameInput);

  const modeGroup = el('div', 'segmented');
  modeGroup.setAttribute('role', 'radiogroup');
  modeGroup.setAttribute('aria-label', 'Tamanho da mesa');
  const modeButtons = MODES.map((m) => {
    const b = el('button', 'seg', `Mesa de ${m} jogadores`);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => {
      mode = m;
      syncMode();
    });
    modeGroup.append(b);
    return b;
  });
  function syncMode(): void {
    MODES.forEach((m, i) => {
      const b = modeButtons[i];
      if (!b) return;
      const on = m === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  }
  syncMode();

  const createBtn = el('button', 'btn primary', 'Criar sala');
  createBtn.type = 'button';

  const divider = el('p', 'muted small', 'ou entre numa mesa');

  const codeInput = el('input', 'input code');
  codeInput.type = 'text';
  codeInput.maxLength = 64; // generous so pasted URLs survive until cleaned
  codeInput.inputMode = 'text';
  codeInput.autocapitalize = 'characters';
  codeInput.autocomplete = 'off';
  codeInput.spellcheck = false;
  codeInput.enterKeyHint = 'go';
  codeInput.placeholder = 'CÓDIGO';
  codeInput.setAttribute('aria-label', `Código da sala (${ROOM_CODE_LENGTH} letras)`);
  let prefill = '';
  try {
    prefill = new URLSearchParams(window.location.search).get('sala') ?? '';
  } catch {
    // No location (non-browser): nothing to prefill.
  }
  codeInput.value = cleanCode(prefill);

  const joinBtn = el('button', 'btn', 'Entrar');
  joinBtn.type = 'button';
  const joinRow = el('div', 'row');
  joinRow.append(codeInput, joinBtn);

  const errorEl = el('p', 'error', state.error?.text ?? '');
  errorEl.setAttribute('role', 'alert');
  errorEl.hidden = !state.error;

  // Set when Criar/Entrar sends; cleared by the next state that carries a result.
  let pending = false;

  function sync(): void {
    const open = state.conn === 'open' && !pending;
    createBtn.disabled = !open || !canCreate(nameInput.value);
    joinBtn.disabled = !open || !canJoin(nameInput.value, codeInput.value);
  }

  function create(): void {
    if (createBtn.disabled) return;
    const name = cleanName(nameInput.value);
    saveName(name);
    pending = true;
    sync();
    send({ t: 'create_room', mode, name });
  }
  function join(): void {
    if (joinBtn.disabled) return;
    const name = cleanName(nameInput.value);
    saveName(name);
    pending = true;
    sync();
    send({ t: 'join_room', code: cleanCode(codeInput.value), name });
  }

  nameInput.addEventListener('input', sync);
  codeInput.addEventListener('input', () => {
    codeInput.value = cleanCode(codeInput.value);
    sync();
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') join();
  });
  createBtn.addEventListener('click', create);
  joinBtn.addEventListener('click', join);
  sync();

  function update(next: AppState): void {
    state = next;
    // A reply (joined / error / room) or a dropped connection ends the wait.
    if (state.error || state.room || state.code || state.conn !== 'open') pending = false;
    errorEl.textContent = state.error?.text ?? '';
    errorEl.hidden = !state.error;
    sync();
  }

  root.append(nameLabel, modeGroup, createBtn, divider, joinRow, errorEl);
  update(state);
  return { element: root, update, destroy: () => undefined };
}
