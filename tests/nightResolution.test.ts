import { describe, it, expect } from 'vitest';
import { chooseKillVictim, evaluateNightResolution } from '../game/engine/nightResolution.js';
import type { GamePlayerState } from '../db/players.js';
import type { NightActionRow } from '../db/nightActions.js';

function makePlayer(partial: Partial<GamePlayerState>): GamePlayerState {
  return {
    user_id: 'u',
    role: 'villager',
    alignment: 'town',
    is_alive: true,
    ...partial,
  };
}

function makeAction(partial: Partial<NightActionRow>): NightActionRow {
  return {
    id: 1,
    game_id: 'g',
    night: 1,
    actor_id: 'u',
    target_id: null,
    action_kind: 'none',
    role: 'villager',
    created_at: Date.now(),
    ...partial,
  };
}

describe('chooseKillVictim', () => {
  it('returns null when there are no targets', () => {
    expect(chooseKillVictim([])).toBeNull();
  });

  it('returns the only target when there is one', () => {
    expect(chooseKillVictim(['a'])).toBe('a');
  });

  it('returns the majority target when one exists', () => {
    const victim = chooseKillVictim(['a', 'b', 'a', 'c', 'a']);
    expect(victim).toBe('a');
  });

  it('returns null when two wolves split their vote (tie)', () => {
    expect(chooseKillVictim(['a', 'b'])).toBeNull();
  });

  it('returns null on a three-way tie', () => {
    expect(chooseKillVictim(['a', 'b', 'c'])).toBeNull();
  });

  it('returns the winner when one target breaks the tie', () => {
    expect(chooseKillVictim(['a', 'b', 'a'])).toBe('a');
  });
});

describe('evaluateNightResolution', () => {
  const players: GamePlayerState[] = [
    makePlayer({ user_id: 'wolf', role: 'werewolf', alignment: 'wolf' }),
    makePlayer({ user_id: 'seer', role: 'seer', alignment: 'town' }),
    makePlayer({ user_id: 'doctor', role: 'doctor', alignment: 'town' }),
    makePlayer({ user_id: 'villager', role: 'villager', alignment: 'town' }),
  ];

  it('is pending until all required night actors have actions', () => {
    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'wolf',
        target_id: 'villager',
        action_kind: 'kill',
        role: 'werewolf',
      }),
      // seer + doctor missing
    ];

    const res = evaluateNightResolution(players, actions, 1);
    expect(res.state).toBe('pending');
  });

  it('returns kill and protect targets once all required actors have acted', () => {
    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'wolf',
        target_id: 'villager',
        action_kind: 'kill',
        role: 'werewolf',
      }),
      makeAction({
        actor_id: 'seer',
        target_id: 'wolf',
        action_kind: 'inspect',
        role: 'seer',
      }),
      makeAction({
        actor_id: 'doctor',
        target_id: 'villager',
        action_kind: 'protect',
        role: 'doctor',
      }),
    ];

    const res = evaluateNightResolution(players, actions, 1);
    expect(res.state).toBe('ready');
    if (res.state === 'ready') {
      expect(res.killTargets).toEqual(['villager']);
      expect(res.protectTargets).toEqual(['villager']);
    }
  });
}
)
