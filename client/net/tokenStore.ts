const KEY = 'truco.token';

export interface TokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Reconnect token kept in storage. Storage errors (private mode) are swallowed. */
export function localTokenStore(storage?: StorageLike): TokenStore {
  const resolve = (): StorageLike | null => {
    try {
      return storage ?? localStorage;
    } catch {
      return null;
    }
  };
  return {
    get() {
      try {
        return resolve()?.getItem(KEY) ?? null;
      } catch {
        return null;
      }
    },
    set(token) {
      try {
        resolve()?.setItem(KEY, token);
      } catch {
        /* ignore */
      }
    },
    clear() {
      try {
        resolve()?.removeItem(KEY);
      } catch {
        /* ignore */
      }
    },
  };
}
