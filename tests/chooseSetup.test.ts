import { describe, it, expect } from 'vitest';
import { chooseSetup } from '../game/balancing/chooseSetup.js';
import { ROLE_REGISTRY } from '../game/balancing/roleRegistry.js';
import type { RoleName } from '../game/types.js';
import { BUCKET_CONFIGS } from '../game/balancing/buckets.js';

function summarizeBuckets(roles: RoleName[]) {
  const buckets: Record<string, number> = {};
  const alignments: Record<string, number> = {};

  for (const role of roles) {
    const def = ROLE_REGISTRY[role];
    const bucket = BUCKET_CONFIGS.find((b) => b.roles.includes(role))?.id ?? 'unknown';
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    alignments[def.alignment] = (alignments[def.alignment] ?? 0) + 1;
  }

  return { buckets, alignments };
}

describe('chooseSetup', () => {
  it('returns exactly playerCount roles', () => {
    for (let n = 1; n <= 10; n += 1) {
      const roles = chooseSetup(n);
      expect(roles).toHaveLength(n);
    }
  });

  it('includes at least one wolf-aligned role when there are 3+ players', () => {
    for (let n = 3; n <= 10; n += 1) {
      const roles = chooseSetup(n);
      const { alignments } = summarizeBuckets(roles);
      expect(alignments.wolf ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses expected bucket counts for small games', () => {
    const roles3 = chooseSetup(3);
    const s3 = summarizeBuckets(roles3);
    expect(roles3).toHaveLength(3);
    // 3 players: 1 wolf_core, no power roles, rest village_core.
    expect(s3.buckets.wolf_core ?? 0).toBe(1);
    expect(s3.buckets.village_power_info ?? 0).toBe(0);
    expect(s3.buckets.village_power_protect ?? 0).toBe(0);

    const roles4 = chooseSetup(4);
    const s4 = summarizeBuckets(roles4);
    expect(roles4).toHaveLength(4);
    // 4 players: 1 wolf_core, 1 info, rest village_core.
    expect(s4.buckets.wolf_core ?? 0).toBe(1);
    expect(s4.buckets.village_power_info ?? 0).toBe(1);
    expect(s4.buckets.village_power_protect ?? 0).toBe(0);

    const roles5 = chooseSetup(5);
    const s5 = summarizeBuckets(roles5);
    expect(roles5).toHaveLength(5);
    // 5 players: 1 wolf_core, 1 info, 1 protect, rest village_core.
    expect(s5.buckets.wolf_core ?? 0).toBe(1);
    expect(s5.buckets.village_power_info ?? 0).toBe(1);
    expect(s5.buckets.village_power_protect ?? 0).toBe(1);
  });

  it('scales wolves up for larger games', () => {
    const roles7 = chooseSetup(7);
    const s7 = summarizeBuckets(roles7);
    expect(s7.buckets.wolf_core ?? 0).toBe(2);

    // 10 players: Math.ceil(10/5) = 2 wolves
    const roles10 = chooseSetup(10);
    const s10 = summarizeBuckets(roles10);
    expect(s10.buckets.wolf_core ?? 0).toBe(2);

    // 11 players: Math.ceil(11/5) = 3 wolves
    const roles11 = chooseSetup(11);
    const s11 = summarizeBuckets(roles11);
    expect(s11.buckets.wolf_core ?? 0).toBe(3);
  });
});
