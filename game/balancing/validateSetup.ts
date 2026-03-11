import type { RoleName } from '../types.js';
import { BUCKET_CONFIGS } from './buckets.js';
import { ROLE_REGISTRY } from './roleRegistry.js';

export function validateSetup(roles: RoleName[]): boolean {
  const wolfCoreCfg = BUCKET_CONFIGS.find((b) => b.id === 'wolf_core');
  const wolfCoreRoles = new Set<RoleName>(wolfCoreCfg ? wolfCoreCfg.roles : []);
  const wolfCount = roles.filter((r) => wolfCoreRoles.has(r)).length;

  if (roles.length >= 3 && wolfCount < 1) {
    return false;
  }

  // Unique roles may appear at most once per game.
  const seen = new Set<RoleName>();
  for (const role of roles) {
    if (ROLE_REGISTRY[role].unique) {
      if (seen.has(role)) return false;
      seen.add(role);
    }
  }

  return true;
}
