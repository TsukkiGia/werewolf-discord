import type { GamePlayerState } from '../../db/players.js';
import {
  revealWolvesLine,
  townWinLine,
  wolfWinLine,
  arsonistWinLine,
} from '../strings/narration.js';

export type WinSide = 'wolves' | 'town' | 'arsonist';

export interface WinResult {
  winner: WinSide;
  /**
   * All players that are aligned with the wolves, alive or dead.
   * Used for revealing the wolves when the game ends.
   */
  wolves: GamePlayerState[];
}

/**
 * Build the standard win message lines shown in the channel when the
 * game ends, including revealing the wolves.
 */
export function buildWinLines(win: WinResult): string[] {
  const lines: string[] = [];

  const wolfMentions =
    win.wolves.length > 0
      ? win.wolves.map((p) => `<@${p.user_id}>`).join(', ')
      : null;

  if (win.winner === 'town') {
    lines.push(townWinLine());
  } else if (win.winner === 'wolves') {
    lines.push(wolfWinLine());
  } else {
    lines.push(arsonistWinLine());
  }

  if (wolfMentions) {
    lines.push(revealWolvesLine(wolfMentions));
  }

  return lines;
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

  // Arsonist wins if they are the only player left alive.
  const arsonistsAlive = alive.filter((p) => p.role === 'arsonist').length;
  if (alive.length === 1 && arsonistsAlive === 1) {
    return { winner: 'arsonist', wolves: wolfPlayers };
  }

  // If any non-arsonist neutral roles are still alive (e.g. Tanner),
  // we defer faction wins to avoid conflicting with their special
  // victory conditions.
  const otherNeutralsAlive = alive.some(
    (p) => p.alignment === 'neutral' && p.role !== 'arsonist',
  );

  if (!otherNeutralsAlive && wolvesAlive === 0 && wolfPlayers.length > 0 && arsonistsAlive === 0) {
    return { winner: 'town', wolves: wolfPlayers };
  }

  // Wolves win once there is exactly one town-aligned player left
  // and at least one wolf still alive. This is checked after each
  // night kill (and day lynch) to see if the game should end.
  if (!otherNeutralsAlive && wolvesAlive >= townAlive && wolfPlayers.length > 0) {
    return { winner: 'wolves', wolves: wolfPlayers };
  }

  return null;
}
