import type { GameRow } from '../../db/games.js';
import type { GamePlayerState } from '../../db/players.js';

export function buildStatusLines(game: GameRow, players: GamePlayerState[]): string[] {
  const phaseLine =
    game.status === 'night'
      ? `Phase: night (Night ${game.current_night || 1})`
      : game.status === 'day'
        ? `Phase: day (Day ${game.current_day || 1})`
        : `Phase: ${game.status}`;

  const playerLines =
    players.length > 0
      ? players
          .map((p) => `${p.is_alive ? '🟢' : '⚫️'} <@${p.user_id}>`)
          .join('\n')
      : 'No players have joined yet.';

  return [
    'Game status for this channel:',
    phaseLine,
    `Host: <@${game.host_id}>`,
    `Players (${players.length}):`,
    playerLines,
  ];
}

/** Standard text shown when a day starts. */
export function buildDayStartLine(dayNumber: number): string {
  return `Day ${dayNumber} begins. You have 30 seconds to discuss before voting starts.`;
}

/** Standard text shown when night begins. */
export function buildNightFallsLine(): string {
  return 'Night falls...';
}

/** Standard text for a no-lynch end of day. */
export function buildNoLynchLine(dayNumber: number): string {
  return `Day ${dayNumber} ends with no majority. No one is lynched.`;
}
