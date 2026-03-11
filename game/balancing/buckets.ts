import type { RoleBucket, RoleName } from '../types.js';

export interface BucketConfig {
  id: RoleBucket;
  /**
   * Return the number of slots this bucket should receive for the given
   * player count. `currentCounts` contains counts already assigned to
   * earlier buckets in the BUCKET_CONFIGS list, so buckets can compute
   * their size relative to others (e.g. villagers = leftovers).
   */
  slotCountForPlayers(
    playerCount: number,
    currentCounts: Record<RoleBucket, number>,
  ): number;
  /**
   * The concrete roles that belong to this bucket. Used for sampling
   * once the number of slots has been determined.
   */
  roles: RoleName[];
}

export const BUCKET_CONFIGS: BucketConfig[] = [
  {
    id: 'wolf_core',
    roles: ['werewolf'],
    slotCountForPlayers: (playerCount) => {
      if (playerCount <= 1) return 0;
      if (playerCount <= 6) return 1;
      if (playerCount <= 9) return 2;
      return 3;
    },
  },
  {
    id: 'village_power_info',
    roles: ['seer'],
    slotCountForPlayers: (playerCount) => (playerCount >= 4 ? 1 : 0),
  },
  {
    id: 'village_power_protect',
    roles: ['doctor'],
    slotCountForPlayers: (playerCount) => (playerCount >= 5 ? 1 : 0),
  },
  {
    id: 'village_core',
    roles: ['villager'],
    slotCountForPlayers: (playerCount, currentCounts) => {
      const used =
        currentCounts.wolf_core +
        currentCounts.village_power_info +
        currentCounts.village_power_protect +
        currentCounts.wolf_support +
        currentCounts.neutral;
      return Math.max(0, playerCount - used);
    },
  },
];
