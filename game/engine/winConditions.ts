import type { GamePlayerState } from '../../db/players.js';
import {
  revealWolvesLine,
  townWinLine,
  wolfWinLine,
  arsonistWinLine,
  serialKillerWinLine,
  cultWinLine,
  revealCultistsLine,
} from '../strings/narration.js';

export type WinSide = 'wolves' | 'town' | 'arsonist' | 'serial_killer' | 'cult';

export interface WinResult {
  winner: WinSide;
  /**
   * All players that are aligned with the wolves, alive or dead.
   * Used for revealing the wolves when the game ends.
   */
  wolves: GamePlayerState[];
  /**
   * All cult-aligned players, alive or dead. Populated when winner === 'cult'.
   */
  cultists: GamePlayerState[];
}

/**
 * Build the standard win message lines shown in the channel when the
 * game ends, including revealing the wolves (and cultists on cult win).
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
  } else if (win.winner === 'cult') {
    lines.push(cultWinLine());
    const cultMentions = win.cultists.map((p) => `<@${p.user_id}>`).join(', ');
    if (cultMentions) lines.push(revealCultistsLine(cultMentions));
  } else if (win.winner === 'serial_killer') {
    lines.push(serialKillerWinLine());
  } else {
    lines.push(arsonistWinLine());
  }

  if (wolfMentions && win.winner !== 'cult') {
    lines.push(revealWolvesLine(wolfMentions));
  }

  return lines;
}

/**
 * Evaluate the win condition for a Werewolf game based on the current
 * set of players.
 *
 * Priority order:
 * 1. Arsonist sole-survivor win.
 * 2. Cult win: all living players are cult-aligned.
 * 3. Town win: no wolves and no cultists alive.
 * 4. Wolf win: wolves outnumber or equal all non-wolf living players.
 */
export function evaluateWinCondition(players: GamePlayerState[]): WinResult | null {
  const alive = players.filter((p) => p.is_alive);

  const wolvesAlive = alive.filter((p) => p.alignment === 'wolf').length;
  const cultsAlive = alive.filter((p) => p.alignment === 'cult').length;
  const wolfPlayers = players.filter((p) => p.alignment === 'wolf');
  const cultPlayers = players.filter((p) => p.alignment === 'cult');

  const serialKillersAlive = alive.filter(
    (p) => p.role === 'serial_killer',
  ).length;
  const arsonistsAlive = alive.filter((p) => p.role === 'arsonist').length;

  // Serial Killer wins if they are the only player left alive.
  if (alive.length === 1 && serialKillersAlive === 1) {
    return {
      winner: 'serial_killer',
      wolves: wolfPlayers,
      cultists: cultPlayers,
    };
  }

  // Arsonist wins if they are the only player left alive.
  if (alive.length === 1 && arsonistsAlive === 1) {
    return { winner: 'arsonist', wolves: wolfPlayers, cultists: cultPlayers };
  }

  // Cult wins if every living player is cult-aligned.
  if (alive.length > 0 && cultsAlive === alive.length) {
    return { winner: 'cult', wolves: wolfPlayers, cultists: cultPlayers };
  }

  // Town wins if no wolves and no cultists are alive.
  if (
    wolvesAlive === 0 &&
    cultsAlive === 0 &&
    wolfPlayers.length > 0 &&
    arsonistsAlive === 0 &&
    serialKillersAlive === 0
  ) {
    return { winner: 'town', wolves: wolfPlayers, cultists: cultPlayers };
  }

  // Wolves win once they outnumber or equal all non-wolf living players.
  const nonWolvesAlive = alive.length - wolvesAlive;
  if (wolvesAlive > 0 && wolvesAlive >= nonWolvesAlive) {
    return { winner: 'wolves', wolves: wolfPlayers, cultists: cultPlayers };
  }

  return null;
}
