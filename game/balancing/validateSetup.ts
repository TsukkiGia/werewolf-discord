import type { RoleName } from '../types.js';
import { BUCKET_CONFIGS } from './buckets.js';

export function validateSetup(roles: RoleName[]): boolean {
  const wolfCoreCfg = BUCKET_CONFIGS.find((b) => b.id === 'wolf_core');
  const wolfCoreRoles = new Set< RoleName >(wolfCoreCfg ? wolfCoreCfg.roles : []);
  const wolfCount = roles.filter((r) => wolfCoreRoles.has(r)).length;

  if (roles.length >= 3 && wolfCount < 1) {
    return false;
  }

  // For now keep validation minimal; expand later as more roles are used.
  return true;
}
