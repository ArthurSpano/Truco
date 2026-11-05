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
// Seating. The protocol and the table layout need these, so they live in
// shared/ (the rules live in engine/seating.ts).

/** Number of players at the table: 1v1, 2v2 or 3v3. */
export type GameMode = 2 | 4 | 6;

/**
 * Seat index, `0` to `mode - 1`. Indices increase counter-clockwise around
 * the table, which is also the direction of play.
 */
export type Seat = number;

/** Team index. Teams are fixed by seat parity: even seats are team `0`, odd seats team `1`. */
export type Team = 0 | 1;

/**
 * A card on the table as everyone sees it. A face-down card (*encoberta*)
 * keeps its identity hidden, so it carries no `card` at all.
 */
export type TableCard =
  { seat: Seat; faceDown: false; card: Card } | { seat: Seat; faceDown: true };

// ---------------------------------------------------------------------------
// Game intents, views and events: the contract between the engine (which
// produces views and events) and the client (which renders them). The rules
// themselves live in engine/.

/** The team that took a trick, or `null` when it was tied (*empate* / *embuchada*). */
export type TrickWinner = Team | null;

/** How the answering team responds to a truco call. */
export type TrucoAnswer = 'accept' | 'run' | 'raise';

/** A mão de onze decision, while waiting and once made. */
export type MaoDeOnzeDecision = 'pending' | 'play' | 'run';

/**
 * Something a player wants to do in the game. The server checks every intent
 * against the game state; the client never decides what is legal.
 */
export type GameIntent =
  | { t: 'play_card'; cardId: CardId; faceDown?: boolean }
  /** Mão de ferro only: play the card at position `slot` of your (unseen) hand. */
  | { t: 'play_blind'; slot: number }
  | { t: 'call_truco' }
  | { t: 'respond'; answer: TrucoAnswer }
  | { t: 'mao11_decision'; play: boolean };

/** A seat as one player sees it. */
export interface PlayerView {
  seat: Seat;
  team: Team;
  /** Cards still in hand. Always public. */
  cardCount: number;
  /** The cards themselves, only when the viewer may see them; `null` otherwise. */
  cards: Card[] | null;
}

/** A finished trick as everyone sees it. */
export interface TrickView {
  /** Cards in playing order; face-down cards stay hidden. */
  cards: TableCard[];
  winner: TrickWinner;
}

/** What the viewer may do right now. Lets the client enable buttons without knowing the rules. */
export interface GameActions {
  /** Play a card face up by id. */
  play: boolean;
  /** Play a card face down (*encoberta*), from trick 2 on. */
  playFaceDown: boolean;
  /** Play blind by hand position (mão de ferro). */
  playBlind: boolean;
  /** The stake the viewer may call (3 = Truco, 6, 9, 12), or `null` if they cannot call. */
  callTruco: number | null;
  /** Set when the viewer may answer a pending call; `raise` is the stake a raise would call, if any. */
  respond: { raise: number | null } | null;
  /** The viewer may decide whether their team plays the mão de onze. */
  decideMaoDeOnze: boolean;
}

/**
 * The game as one seat sees it: everything public, plus the hands that seat
 * may look at. Never contains other players' hidden cards, face-down
 * identities or the RNG state.
 */
export interface GameView {
  mode: GameMode;
  /** The viewer's seat and team. */
  seat: Seat;
  team: Team;
  /** Match score, indexed by team. */
  scores: [number, number];
  /** 1-based number of the hand being played. */
  handNumber: number;
  dealer: Seat;
  /** Leads the first trick and wins an all-tied hand. */
  mao: Seat;
  /**
   * Seat expected to play next (play pauses while a truco call or mão de onze
   * decision is pending), or `null` once the match is over.
   */
  turn: Seat | null;
  vira: Card;
  /** Rank of this hand's manilhas (the rank after the vira). */
  manilha: Rank;
  /** Points the hand is worth right now. */
  value: number;
  /** A truco call or raise waiting for an answer. */
  truco: { caller: Seat; team: Team; stake: number } | null;
  /** Team that made the latest accepted raise; only the other team may raise next. */
  raisedBy: Team | null;
  maoDeOnze: { team: Team; decision: MaoDeOnzeDecision } | null;
  maoDeFerro: boolean;
  /** Every seat, indexed by seat. */
  players: PlayerView[];
  /** Cards on the table for the trick in progress, in playing order. */
  trick: TableCard[];
  /** Finished tricks of this hand, oldest first. */
  tricks: TrickView[];
  /** Team that reached 12 points, or `null` while the match goes on. */
  winner: Team | null;
  actions: GameActions;
}

/**
 * Something that just happened, for animations and sounds. Events are public:
 * every player receives the same ones, so they never carry hidden cards.
 */
export type GameEvent =
  | { t: 'card_played'; seat: Seat; card: TableCard }
  | { t: 'trick_won'; winner: TrickWinner; leader: Seat; cards: TableCard[] }
  | { t: 'truco_called'; seat: Seat; stake: number }
  /** For `raise`, `stake` is the new call; otherwise the call that was accepted or run from. */
  | { t: 'truco_answered'; seat: Seat; answer: TrucoAnswer; stake: number }
  | { t: 'mao_de_onze_decided'; seat: Seat; play: boolean }
  /** `ranBy` is set when the hand ended because a team ran. `scores` are after this hand. */
  | {
      t: 'hand_won';
      team: Team;
      points: number;
      ranBy: Team | null;
      scores: [number, number];
    }
  | {
      t: 'hand_dealt';
      handNumber: number;
      dealer: Seat;
      maoDeOnze: Team | null;
      maoDeFerro: boolean;
    }
  | { t: 'match_won'; team: Team; scores: [number, number] };

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
