import { describe, it, expect } from 'vitest';
import { buildWinLines, evaluateWinCondition } from '../game/engine/winConditions.js';
import type { GamePlayerState } from '../db/players.js';

function makePlayer(partial: Partial<GamePlayerState>): GamePlayerState {
  return {
    user_id: 'u',
    role: 'villager',
    alignment: 'town',
    is_alive: true,
    ...partial,
  };
}

describe('evaluateWinCondition', () => {
  it('returns town win when no wolves are alive', () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 't1', alignment: 'town', is_alive: true }),
      makePlayer({ user_id: 't2', alignment: 'town', is_alive: true }),
      // dead wolf
      makePlayer({ user_id: 'w1', alignment: 'wolf', is_alive: false, role: 'werewolf' }),
    ];

    const win = evaluateWinCondition(players);
    expect(win).not.toBeNull();
    if (win) {
      expect(win.winner).toBe('town');
      expect(win.wolves.map((p) => p.user_id)).toEqual(['w1']);
    }
  });

  it('returns wolves win when wolves equal town', () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 't1', alignment: 'town', is_alive: true }),
      makePlayer({ user_id: 'w1', alignment: 'wolf', is_alive: true, role: 'werewolf' }),
      makePlayer({ user_id: 'w2', alignment: 'wolf', is_alive: true, role: 'werewolf' }),
    ];

    const win = evaluateWinCondition(players);
    expect(win).not.toBeNull();
    if (win) {
      expect(win.winner).toBe('wolves');
      expect(win.wolves.map((p) => p.user_id).sort()).toEqual(['w1', 'w2']);
    }
  });

  it('returns wolves win when wolves outnumber town (regression: was == instead of >=)', () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 't1', alignment: 'town', is_alive: true }),
      makePlayer({ user_id: 'w1', alignment: 'wolf', is_alive: true, role: 'werewolf' }),
      makePlayer({ user_id: 'w2', alignment: 'wolf', is_alive: true, role: 'werewolf' }),
      makePlayer({ user_id: 'w3', alignment: 'wolf', is_alive: true, role: 'werewolf' }),
    ];

    const win = evaluateWinCondition(players);
    expect(win).not.toBeNull();
    if (win) expect(win.winner).toBe('wolves');
  });

  it('returns null when both sides still have multiple players', () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 't1', alignment: 'town', is_alive: true }),
      makePlayer({ user_id: 't2', alignment: 'town', is_alive: true }),
      makePlayer({ user_id: 'w1', alignment: 'wolf', is_alive: true, role: 'werewolf' }),
    ];

    const win = evaluateWinCondition(players);
    expect(win).toBeNull();
  });

});

describe('buildWinLines', () => {
  it('includes winner text and list of wolves', () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'w1', alignment: 'wolf', role: 'werewolf' }),
      makePlayer({ user_id: 'w2', alignment: 'wolf', role: 'werewolf' }),
    ];

    const lines = buildWinLines({ winner: 'wolves', wolves: players });
    expect(lines[0]).toContain('Wolves win');
    expect(lines[1]).toContain('<@w1>');
    expect(lines[1]).toContain('<@w2>');
  });
});
