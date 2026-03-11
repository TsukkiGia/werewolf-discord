import type { RoleName } from '../types.js';
import { validateSetup } from './validateSetup.js';

export function chooseSetup(playerCount: number): RoleName[] {
  const roles: RoleName[] = [];

  if (playerCount <= 0) return roles;

  // Basic v1 bucketed setup using the four core roles:
  // villager, werewolf, seer, doctor.
  //
  // This is intentionally conservative and easy to reason about; it
  // can be extended later as more roles are introduced.

  // Determine how many of each role we want for a given player count.
  let wolfCount = 0;
  let seerCount = 0;
  let doctorCount = 0;

  if (playerCount === 1) {
    wolfCount = 0;
  } else if (playerCount === 2) {
    wolfCount = 1;
  } else if (playerCount <= 6) {
    wolfCount = 1;
  } else if (playerCount <= 9) {
    wolfCount = 2;
  } else {
    wolfCount = 3;
  }

  if (playerCount >= 4) {
    seerCount = 1;
  }

  if (playerCount >= 5) {
    doctorCount = 1;
  }

  const specialCount = wolfCount + seerCount + doctorCount;
  const villagerCount = Math.max(0, playerCount - specialCount);

  for (let i = 0; i < wolfCount; i += 1) {
    roles.push('werewolf');
  }
  for (let i = 0; i < seerCount; i += 1) {
    roles.push('seer');
  }
  for (let i = 0; i < doctorCount; i += 1) {
    roles.push('doctor');
  }
  for (let i = 0; i < villagerCount; i += 1) {
    roles.push('villager');
  }

  if (!validateSetup(roles)) {
    throw new Error('Generated role setup did not pass validation.');
  }

  return roles;
}
