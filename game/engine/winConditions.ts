import type { GamePlayerState } from '../../db/players.js';

export type WinSide = 'wolves' | 'town';

export interface WinResult {
  winner: WinSide;
}

/**
 * Evaluate the win condition for a Werewolf game based on the current
 * set of players.
 *
 * Rules (v1):
 * - Town wins if there are no alive wolves.
 * - Wolves win if they are the only alignment left alive
 *   (i.e. at least one wolf, and zero town).
 * - Otherwise, the game continues.
 */
export function evaluateWinCondition(players: GamePlayerState[]): WinResult | null {
  const alive = players.filter((p) => p.is_alive);

  const wolves = alive.filter((p) => p.alignment === 'wolf').length;
  const town = alive.filter((p) => p.alignment === 'town').length;

  if (wolves === 0) {
    return { winner: 'town' };
  }

  if (town === 0 && wolves > 0) {
    return { winner: 'wolves' };
  }

  return null;
}
