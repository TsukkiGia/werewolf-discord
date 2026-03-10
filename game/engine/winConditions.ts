import type { GamePlayerState } from '../../db/players.js';

export type WinSide = 'wolves' | 'town';

export interface WinResult {
  winner: WinSide;
  /**
   * All players that are aligned with the wolves, alive or dead.
   * Used for revealing the wolves when the game ends.
   */
  wolves: GamePlayerState[];
}

/**
 * Evaluate the win condition for a Werewolf game based on the current
 * set of players.
 *
 * Rules (v1):
 * - Town wins if there are no alive wolves.
 * - Wolves win if there is at least one wolf and at most one alive town player.
 *   (i.e. wolves win once town is reduced to 1 or 0 players).
 * - Otherwise, the game continues.
 */
export function evaluateWinCondition(players: GamePlayerState[]): WinResult | null {
  const alive = players.filter((p) => p.is_alive);

  const wolvesAlive = alive.filter((p) => p.alignment === 'wolf').length;
  const townAlive = alive.filter((p) => p.alignment === 'town').length;
  const wolfPlayers = players.filter((p) => p.alignment === 'wolf');

  if (wolvesAlive === 0 && wolfPlayers.length > 0) {
    return { winner: 'town', wolves: wolfPlayers };
  }

  // Wolves win once there is exactly one town-aligned player left
  // and at least one wolf still alive. This is checked after each
  // night kill (and day lynch) to see if the game should end.
  if (wolvesAlive > 0 && townAlive <= 1 && wolfPlayers.length > 0) {
    return { winner: 'wolves', wolves: wolfPlayers };
  }

  return null;
}
