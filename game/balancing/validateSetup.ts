import type { RoleName } from '../types.js';
import { ROLE_REGISTRY } from './roleRegistry.js';

export function validateSetup(roles: RoleName[]): boolean {
  const wolfCount = roles.filter((r) => ROLE_REGISTRY[r].alignment === 'wolf').length;

  if (roles.length >= 3 && wolfCount < 1) {
    return false;
  }

  // For now keep validation minimal; expand later as more roles are used.
  return true;
}
