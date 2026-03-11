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

  it('ignores votes from dead players', () => {
    const withDead: GamePlayerState[] = [
      makePlayer({ user_id: 'a' }),
      makePlayer({ user_id: 'b' }),
      makePlayer({ user_id: 'c', is_alive: false }),
    ];
    const votes: DayVoteRow[] = [
      makeVote({ voter_id: 'a', target_id: 'b' }),
      makeVote({ voter_id: 'c', target_id: 'a' }), // dead voter — should be ignored
    ];

    expect(chooseLynchVictim(withDead, votes)).toBe('b');
  });

  it('ignores votes targeting dead players', () => {
    const withDead: GamePlayerState[] = [
      makePlayer({ user_id: 'a' }),
      makePlayer({ user_id: 'b', is_alive: false }),
      makePlayer({ user_id: 'c' }),
    ];
    const votes: DayVoteRow[] = [
      makeVote({ voter_id: 'a', target_id: 'b' }), // dead target — should be ignored
      makeVote({ voter_id: 'c', target_id: 'a' }),
    ];

    expect(chooseLynchVictim(withDead, votes)).toBe('a');
  });
});

describe('evaluateDayResolution', () => {
  it('returns pending when not all alive players have voted', () => {
    const votes: DayVoteRow[] = [
      makeVote({ voter_id: 'a', target_id: 'b' }),
      // b and c have not voted
    ];

    expect(evaluateDayResolution(players, votes).state).toBe('pending');
  });

  it('returns pending when no one has voted', () => {
    expect(evaluateDayResolution(players, []).state).toBe('pending');
  });

  it('returns lynch when everyone has voted and there is a clear plurality', () => {
    const votes: DayVoteRow[] = [
      makeVote({ voter_id: 'a', target_id: 'b' }),
      makeVote({ voter_id: 'b', target_id: 'b' }),
      makeVote({ voter_id: 'c', target_id: 'b' }),
    ];

    const res = evaluateDayResolution(players, votes);
    expect(res.state).toBe('lynch');
    if (res.state === 'lynch') expect(res.lynchId).toBe('b');
  });

  it('returns no_lynch when everyone has voted but top candidates are tied', () => {
    const votes: DayVoteRow[] = [
      makeVote({ voter_id: 'a', target_id: 'b' }),
      makeVote({ voter_id: 'b', target_id: 'c' }),
      makeVote({ voter_id: 'c', target_id: 'a' }),
    ];

    expect(evaluateDayResolution(players, votes).state).toBe('no_lynch');
  });

  it('treats a lynched Tanner as a special outcome outside normal day resolution (covered in orchestrator tests)', () => {
    // Day-resolution itself remains unaware of Tanner; its special win is
    // triggered in gameOrchestrator after the lynch is applied. This test is
    // just a reminder that evaluateDayResolution does not short-circuit for
    // Tanner and still reports a normal lynch state.
    const playersWithTanner: GamePlayerState[] = [
      makePlayer({ user_id: 'tan', role: 'tanner', alignment: 'neutral' }),
      makePlayer({ user_id: 'a' }),
      makePlayer({ user_id: 'b' }),
    ];
    const votes: DayVoteRow[] = [
      makeVote({ voter_id: 'a', target_id: 'tan' }),
      makeVote({ voter_id: 'b', target_id: 'tan' }),
      makeVote({ voter_id: 'tan', target_id: 'a' }),
    ];

    const res = evaluateDayResolution(playersWithTanner, votes);
    expect(res.state).toBe('lynch');
    if (res.state === 'lynch') expect(res.lynchId).toBe('tan');
  });

  describe('force=true (timeout path)', () => {
    it('resolves with plurality from partial votes', () => {
      const votes: DayVoteRow[] = [
        makeVote({ voter_id: 'a', target_id: 'b' }),
        makeVote({ voter_id: 'b', target_id: 'b' }),
        // c has not voted
      ];

      const res = evaluateDayResolution(players, votes, { force: true });
      expect(res.state).toBe('lynch');
      if (res.state === 'lynch') expect(res.lynchId).toBe('b');
    });

    it('returns no_lynch when partial votes are tied', () => {
      const votes: DayVoteRow[] = [
        makeVote({ voter_id: 'a', target_id: 'b' }),
        makeVote({ voter_id: 'b', target_id: 'c' }),
        // c has not voted
      ];

      expect(evaluateDayResolution(players, votes, { force: true }).state).toBe('no_lynch');
    });

    it('returns no_lynch when no one has voted', () => {
      expect(evaluateDayResolution(players, [], { force: true }).state).toBe('no_lynch');
    });
  });
});
