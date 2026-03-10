import type { RoleName } from '../types.js';
import { validateSetup } from './validateSetup.js';

export function chooseSetup(playerCount: number): RoleName[] {
  const roles: RoleName[] = [];

  if (playerCount <= 0) return roles;

  if (playerCount >= 1) {
    // Minimal v1: 1 werewolf, rest villagers.
    roles.push('werewolf');
    for (let i = 1; i < playerCount; i += 1) {
      roles.push('villager');
    }
  } else {
    // Very small games: everyone villager.
    for (let i = 0; i < playerCount; i += 1) {
      roles.push('villager');
    }
  }

  if (!validateSetup(roles)) {
    throw new Error('Generated role setup did not pass validation.');
  }

  return roles;
}
