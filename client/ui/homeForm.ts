import { MAX_NAME_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/protocol.js';

const NAME_KEY = 'truco.name';

/** Upper-case, keep only room-code alphabet characters, cap at the code length. */
export function cleanCode(input: string): string {
  let source = input;
  const m = /[?&#](?:sala|code)=([^&#\s]*)/i.exec(input);
  if (m?.[1] !== undefined) {
    try {
      source = decodeURIComponent(m[1]);
    } catch {
      source = m[1];
    }
  }
  let out = '';
  for (const ch of source.toUpperCase()) {
    if (ROOM_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length === ROOM_CODE_LENGTH) break;
  }
  return out;
}

/** Trim, collapse runs of whitespace, cut to the max length. */
export function cleanName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH).trim();
}

export function canCreate(name: string): boolean {
  return cleanName(name).length > 0;
}

export function canJoin(name: string, code: string): boolean {
  return canCreate(name) && cleanCode(code).length === ROOM_CODE_LENGTH;
}

export function loadName(): string {
  try {
    return cleanName(localStorage.getItem(NAME_KEY) ?? '');
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage may be unavailable (private mode); the name just isn't remembered.
  }
}
