import type { GamePlayerState } from '../../db/players.js';
import type { DayVoteRow } from '../../db/votes.js';

/**
 * Choose a lynch victim based on day votes.
 *
 * Rules:
 * - Only votes from alive players, targeting alive players, are counted.
 * - A player is lynched only if they reach strict majority:
 *   votes >= floor(aliveCount / 2) + 1.
 * - If no one has majority yet, returns null.
 */
export function chooseLynchVictim(
  players: GamePlayerState[],
  votes: DayVoteRow[],
): string | null {
  const aliveIds = new Set(
    players.filter((p) => p.is_alive).map((p) => p.user_id),
  );

  const aliveCount = aliveIds.size;
  if (aliveCount === 0) return null;

  const majority = Math.floor(aliveCount / 2) + 1;

  const counts = new Map<string, number>();
  for (const vote of votes) {
    const voterId = vote.voter_id;
    const targetId = vote.target_id;
    if (!aliveIds.has(voterId) || !aliveIds.has(targetId)) continue;
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  for (const [targetId, count] of counts) {
    if (count >= majority) {
      return targetId;
    }
  }

  return null;
}

