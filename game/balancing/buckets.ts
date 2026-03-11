import type { RoleBucket, RoleName } from '../types.js';

/**
 * Describes which concrete roles belong to each setup bucket.
 * Slot counts and selection logic live in chooseSetup.ts.
 */
export interface BucketConfig {
  id: RoleBucket;
  roles: RoleName[];
}

export const BUCKET_CONFIGS: BucketConfig[] = [
  {
    id: 'wolf_core',
    roles: ['werewolf', 'wolf_cub', 'alpha_wolf'],
  },
  {
    id: 'wolf_support',
    roles: ['sorcerer'],
  },
  {
    id: 'village_power_info',
    roles: ['seer', 'fool'],
  },
  {
    id: 'village_power_protect',
    roles: ['doctor'],
  },
  {
    id: 'village_power_reactive',
    roles: ['hunter', 'cupid', 'thief'],
  },
  {
    id: 'village_mason',
    roles: ['mason'],
  },
  {
    id: 'village_power_visit',
    roles: ['harlot', 'chemist'],
  },
  {
    id: 'neutral',
    roles: ['arsonist', 'tanner'],
  },
  {
    id: 'village_core',
    roles: ['villager', 'clumsy_guy'],
  },
];
