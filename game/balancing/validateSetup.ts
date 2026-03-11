import type { RoleName } from '../types.js';
import { WOLF_PACK_ROLES } from '../types.js';
import { ROLE_REGISTRY } from './roleRegistry.js';

export function validateSetup(roles: RoleName[]): boolean {
  // At least one wolf pack member for any real game.
  if (roles.length >= 3) {
    const wolfCount = roles.filter((r) => WOLF_PACK_ROLES.has(r)).length;
    if (wolfCount < 1) return false;
  }

  // Unique roles may appear at most once.
  const seen = new Set<RoleName>();
  for (const role of roles) {
    if (ROLE_REGISTRY[role].unique) {
      if (seen.has(role)) return false;
      seen.add(role);
    }
  }

  // Masons must come in pairs (even count).
  const masonCount = roles.filter((r) => r === 'mason').length;
  if (masonCount % 2 !== 0) return false;

  return true;
}
