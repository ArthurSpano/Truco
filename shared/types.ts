/** Default HTTP/WebSocket port. Override with the PORT env var. */
export const DEFAULT_PORT = 3000;

// ---------------------------------------------------------------------------
// Cards. Rendering needs these too, so they live in shared/ (the ordering
// rules live in engine/deck.ts).

/** Card suits: ♣ paus, ♥ copas, ♠ espadas, ♦ ouros. */
export type Suit = 'clubs' | 'hearts' | 'spades' | 'diamonds';

/** The ten ranks of the Truco deck (8, 9 and 10 are removed). */
export type Rank = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3';

/** One-letter suit code used in card ids. */
export type SuitCode = 'c' | 'h' | 's' | 'd';

/** Compact, stable card id: rank followed by suit code, e.g. `"Ac"`, `"7d"`. */
export type CardId = `${Rank}${SuitCode}`;

export interface Card {
  id: CardId;
  rank: Rank;
  suit: Suit;
}

// ---------------------------------------------------------------------------

/** One way to reach the server from another device on the LAN. */
export interface LanAddress {
  /** OS network interface name, e.g. "wlan0" or "en0". */
  iface: string;
  /** IPv4 address on that interface. */
  address: string;
  /** Full URL to open on a phone, e.g. "http://192.168.0.12:3000". */
  url: string;
  /** True for interfaces that are probably virtual (Docker, VPN, VM bridges). */
  virtual: boolean;
}

/** Response body of `GET /api/info`. */
export interface ServerInfo {
  name: string;
  port: number;
  /** Best guess first: the URL friends should use. */
  urls: LanAddress[];
}
