import type { GamePlayerState } from '../../db/players.js';
import type { DayVoteRow } from '../../db/votes.js';

/**
 * Choose a lynch victim based on day votes.
 *
 * Rules:
 * - Only votes from alive players, targeting alive players, are counted.
 * - The player with the highest vote count (plurality) is lynched.
 * - If there is a tie for highest votes, returns null (no lynch).
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

  const counts = new Map<string, number>();
  for (const vote of votes) {
    const voterId = vote.voter_id;
    const targetId = vote.target_id;
    if (!aliveIds.has(voterId) || !aliveIds.has(targetId)) continue;
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  let bestId: string | null = null;
  let bestCount = 0;
  let isTie = false;

  for (const [targetId, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestId = targetId;
      isTie = false;
    } else if (count === bestCount && bestId !== null) {
      isTie = true;
    }
  }

  if (!bestId || isTie) return null;
  return bestId;
}

export type DayResolutionState = 'pending' | 'no_lynch' | 'lynch';

export interface DayResolutionResultPending {
  state: 'pending';
}

export interface DayResolutionResultNoLynch {
  state: 'no_lynch';
}

export interface DayResolutionResultLynch {
  state: 'lynch';
  lynchId: string;
}

export type DayResolutionResult =
  | DayResolutionResultPending
  | DayResolutionResultNoLynch
  | DayResolutionResultLynch;

/**
 * Evaluate the current day votes and decide whether:
 * - the day is still pending (not everyone has voted),
 * - there is a lynch target (plurality winner),
 * - or the day ends in a no-lynch (tie).
 *
 * This is pure game logic; side-effects (messages, DB writes) live in app.ts.
 */
export function evaluateDayResolution(
  players: GamePlayerState[],
  votes: DayVoteRow[],
): DayResolutionResult {
  const aliveIds = new Set(
    players.filter((p) => p.is_alive).map((p) => p.user_id),
  );
  const validVotes = votes.filter(
    (v) => aliveIds.has(v.voter_id) && aliveIds.has(v.target_id),
  );

  if (validVotes.length === 0) {
    // No one voted for a valid, living target.
    return { state: 'no_lynch' };
  }

  const lynchId = chooseLynchVictim(players, validVotes);
  if (!lynchId) {
    return { state: 'no_lynch' };
  }

  return { state: 'lynch', lynchId };
}
