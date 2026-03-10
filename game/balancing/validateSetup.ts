import type { RoleName } from '../types.js';

export function validateSetup(roles: RoleName[]): boolean {
  const wolfCount = roles.filter((r) => r === 'werewolf').length;

  if (roles.length >= 3 && wolfCount < 1) {
    return false;
  }

  // For now keep validation minimal; expand later as more roles are used.
  return true;
}

