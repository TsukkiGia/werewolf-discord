import { describe, it, expect } from 'vitest';
import { chooseSetup } from '../game/balancing/chooseSetup.js';
import { ROLE_REGISTRY } from '../game/balancing/roleRegistry.js';
import { WOLF_PACK_ROLES } from '../game/types.js';
import type { RoleName } from '../game/types.js';
import { BUCKET_CONFIGS } from '../game/balancing/buckets.js';

function summarize(roles: RoleName[]) {
  const buckets: Record<string, number> = {};
  const alignments: Record<string, number> = {};
  let wolves = 0;
  let neutrals = 0;

  for (const role of roles) {
    const def = ROLE_REGISTRY[role];
    const bucket = BUCKET_CONFIGS.find((b) => b.roles.includes(role))?.id ?? 'unknown';
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    alignments[def.alignment] = (alignments[def.alignment] ?? 0) + 1;
    if (WOLF_PACK_ROLES.has(role)) wolves += 1;
    if (def.alignment === 'neutral') neutrals += 1;
  }

  return { buckets, alignments, wolves, neutrals };
}

describe('chooseSetup', () => {
  it('returns exactly playerCount roles', () => {
    for (let n = 1; n <= 15; n += 1) {
      const roles = chooseSetup(n);
      expect(roles).toHaveLength(n);
    }
  });

  it('includes at least one wolf pack role for 3+ players', () => {
    for (let n = 3; n <= 15; n += 1) {
      const roles = chooseSetup(n);
      const { wolves } = summarize(roles);
      expect(wolves).toBeGreaterThanOrEqual(1);
    }
  });

  it('wolf count scales with player count (Math.ceil(n/5), min 1)', () => {
    // ≤5 → 1 wolf
    for (let n = 1; n <= 5; n += 1) {
      const { wolves } = summarize(chooseSetup(n));
      expect(wolves).toBe(1);
    }
    // 6–10 → 2 wolves
    for (let n = 6; n <= 10; n += 1) {
      const { wolves } = summarize(chooseSetup(n));
      expect(wolves).toBe(2);
    }
    // 11–15 → 3 wolves
    for (let n = 11; n <= 15; n += 1) {
      const { wolves } = summarize(chooseSetup(n));
      expect(wolves).toBe(3);
    }
  });

  it('respects minPlayers thresholds for power roles', () => {
    // At 4 players: seer/doctor/hunter require 5+/5+/6+, so none should appear.
    for (let i = 0; i < 10; i += 1) {
      const roles = chooseSetup(4);
      expect(roles).not.toContain('seer');
      expect(roles).not.toContain('doctor');
      expect(roles).not.toContain('hunter');
    }

    // At 5 players: seer and doctor are the only eligible power roles.
    // Budget 3.0 → both should always be selected.
    for (let i = 0; i < 20; i += 1) {
      const roles = chooseSetup(5);
      expect(roles).toContain('seer');
      expect(roles).toContain('doctor');
    }
  });

  it('never includes a neutral role below 8 players', () => {
    for (let n = 1; n <= 7; n += 1) {
      for (let i = 0; i < 20; i += 1) {
        const { neutrals } = summarize(chooseSetup(n));
        expect(neutrals).toBe(0);
      }
    }
  });

  it('masons always come in pairs when present', () => {
    for (let n = 5; n <= 15; n += 1) {
      for (let i = 0; i < 10; i += 1) {
        const roles = chooseSetup(n);
        const masonCount = roles.filter((r) => r === 'mason').length;
        expect(masonCount % 2).toBe(0);
      }
    }
  });

  it('sorcerer only appears at 9+ players (requires 2+ wolves)', () => {
    for (let n = 1; n <= 8; n += 1) {
      for (let i = 0; i < 10; i += 1) {
        expect(chooseSetup(n)).not.toContain('sorcerer');
      }
    }
  });

  it('all role names in the setup are valid', () => {
    for (let n = 1; n <= 15; n += 1) {
      const roles = chooseSetup(n);
      for (const role of roles) {
        expect(ROLE_REGISTRY[role]).toBeDefined();
      }
    }
  });
});
