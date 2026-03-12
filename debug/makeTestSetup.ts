/**
 * Debug helpers for manually testing game mechanics.
 * Usage: swap chooseSetup for makeTestSetup in assignRoles.ts temporarily.
 */

import type { RoleName } from '../game/types.js';

/**
 * Returns a setup with exactly two desired roles and the rest villagers.
 * Always includes at least one wolf-pack role so the setup passes validation:
 * - If either desired role is already a wolf-pack role, both are included plus villagers.
 * - If neither is wolf-pack, an extra 'werewolf' is added in slot 0 and both
 *   desired roles follow it.
 *
 * Examples (5 players):
 *   makeTestSetup(5, 'seer', 'doctor')
 *   → ['werewolf', 'seer', 'doctor', 'villager', 'villager']
 *
 *   makeTestSetup(5, 'werewolf', 'seer')
 *   → ['werewolf', 'seer', 'villager', 'villager', 'villager']
 */
export function makeTestSetup(
  playerCount: number,
  roleA: RoleName,
  roleB: RoleName,
): RoleName[] {
  const WOLF_PACK = new Set<RoleName>(['werewolf', 'wolf_cub', 'alpha_wolf']);

  const hasWolf = WOLF_PACK.has(roleA) || WOLF_PACK.has(roleB);

  if (!hasWolf && playerCount < 3) {
    throw new Error(
      `makeTestSetup: need at least 3 players to include both ${roleA} and ${roleB} plus a wolf`,
    );
  }

  const roles: RoleName[] = [];

  if (!hasWolf) {
    roles.push('werewolf');
  }

  roles.push(roleA);
  if (roles.length < playerCount) {
    roles.push(roleB);
  }

  while (roles.length < playerCount) {
    roles.push('villager');
  }

  return roles.slice(0, playerCount) as RoleName[];
}
