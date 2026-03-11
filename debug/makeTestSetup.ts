/**
 * Debug helpers for manually testing game mechanics.
 * Usage: swap chooseSetup for makeTestSetup in assignRoles.ts temporarily.
 */

import type { RoleName } from '../game/types.js';

/**
 * Returns a setup with exactly one of the desired role and the rest villagers.
 * Always includes at least one werewolf so the setup passes validation — if
 * the desired role is not a wolf, a werewolf is added in slot 0 and the
 * desired role is in slot 1.
 *
 * Example:
 *   makeTestSetup(5, 'seer')
 *   → ['werewolf', 'seer', 'villager', 'villager', 'villager']
 *
 *   makeTestSetup(5, 'werewolf')
 *   → ['werewolf', 'villager', 'villager', 'villager', 'villager']
 */
export function makeTestSetup(playerCount: number, role: RoleName): RoleName[] {
  const WOLF_PACK = new Set<RoleName>(['werewolf', 'wolf_cub', 'alpha_wolf']);

  if (WOLF_PACK.has(role)) {
    // The desired role is already a wolf — put it first, fill with villagers.
    return [role, ...Array(playerCount - 1).fill('villager')] as RoleName[];
  }

  // Non-wolf role: slot 0 = werewolf, slot 1 = desired role, rest = villagers.
  if (playerCount < 2) {
    throw new Error(`makeTestSetup: need at least 2 players to include both a wolf and ${role}`);
  }

  return [
    'werewolf',
    role,
    ...(Array(playerCount - 2).fill('villager') as RoleName[]),
  ];
}
