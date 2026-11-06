import type { GameEvent } from '../../shared/types.js';

export type SfxName = 'slap' | 'knock' | 'sweep' | 'win' | 'lose' | 'chime';

/** Which sounds a game event should trigger, from the point of view of `myTeam`. */
export function sfxFor(event: GameEvent, myTeam: 0 | 1): SfxName[] {
  switch (event.t) {
    case 'card_played':
      return ['slap'];
    case 'truco_called':
      return ['knock'];
    case 'truco_answered':
      return ['chime'];
    case 'trick_won':
      return ['sweep'];
    case 'match_won':
      return [event.team === myTeam ? 'win' : 'lose'];
    default:
      return [];
  }
}
