import type { RoleDefinition } from '../types.js';
import { VillagerRole } from '../roles/villager.js';
import { WerewolfRole } from '../roles/werewolf.js';
import { SeerRole } from '../roles/seer.js';
import { DoctorRole } from '../roles/doctor.js';
import type { RoleName } from '../types.js';

export const ROLE_REGISTRY: Record<RoleName, RoleDefinition> = {
  villager: VillagerRole,
  werewolf: WerewolfRole,
  seer: SeerRole,
  doctor: DoctorRole,
};
