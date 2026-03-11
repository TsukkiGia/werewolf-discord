import { describe, it, expect } from 'vitest';
import { chooseLynchVictim, evaluateDayResolution } from '../game/engine/dayResolution.js';
import type { GamePlayerState } from '../db/players.js';
import type { DayVoteRow } from '../db/votes.js';

function makePlayer(partial: Partial<GamePlayerState>): GamePlayerState {
  return {
    user_id: 'u',
    role: 'villager',
    alignment: 'town',
    is_alive: true,
    ...partial,
  };
}

function makeVote(partial: Partial<DayVoteRow>): DayVoteRow {
  return {
    id: 1,
    game_id: 'g',
    day: 1,
    voter_id: 'u',
    target_id: 'v',
    created_at: Date.now(),
    ...partial,
  };
}

const players: GamePlayerState[] = [
  makePlayer({ user_id: 'a' }),
  makePlayer({ user_id: 'b' }),
  makePlayer({ user_id: 'c' }),
];

describe('chooseLynchVictim', () => {
  it('returns target with highest vote count (plurality)', () => {
    const votes: DayVoteRow[] = [
      makeVote({ voter_id: 'a', target_id: 'b' }),
      makeVote({ voter_id: 'b', target_id: 'b' }),
      makeVote({ voter_id: 'c', target_id: 'b' }),
    ];

    expect(chooseLynchVictim(players, votes)).toBe('b');
  });

  it('returns null when top candidates are tied', () => {
    const votes: DayVoteRow[] = [
      makeVote({ voter_id: 'a', target_id: 'b' }),
      makeVote({ voter_id: 'b', target_id: 'c' }),
      makeVote({ voter_id: 'c', target_id: 'a' }),
    ];

    expect(chooseLynchVictim(players, votes)).toBeNull();
  });
});

describe('evaluateDayResolution', () => {
  it('is pending while not all alive players have voted', () => {
    const votes: DayVoteRow[] = [
      makeVote({ voter_id: 'a', target_id: 'b' }),
    ];

    const res = evaluateDayResolution(players, votes);
    expect(res.state).toBe('pending');
  });

  it('returns lynch when majority reached and everyone has voted', () => {
    const votes: DayVoteRow[] = [
      makeVote({ voter_id: 'a', target_id: 'b' }),
      makeVote({ voter_id: 'b', target_id: 'b' }),
      makeVote({ voter_id: 'c', target_id: 'b' }),
    ];

    const res = evaluateDayResolution(players, votes);
    expect(res.state).toBe('lynch');
    if (res.state === 'lynch') {
      expect(res.lynchId).toBe('b');
    }
  });

  it('returns no_lynch when everyone has voted but no majority', () => {
    const votes: DayVoteRow[] = [
      makeVote({ voter_id: 'a', target_id: 'b' }),
      makeVote({ voter_id: 'b', target_id: 'c' }),
      makeVote({ voter_id: 'c', target_id: 'a' }),
    ];

    const res = evaluateDayResolution(players, votes);
    expect(res.state).toBe('no_lynch');
  });
});
