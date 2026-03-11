import type { RoleDefinition } from '../types.js';
import { VillagerRole } from '../roles/villager.js';
import { WerewolfRole } from '../roles/werewolf.js';
import { SeerRole } from '../roles/seer.js';
import { FoolRole } from '../roles/fool.js';
import { DoctorRole } from '../roles/doctor.js';
import { MasonRole } from '../roles/mason.js';
import { SorcererRole } from '../roles/sorcerer.js';
import { HunterRole } from '../roles/hunter.js';
import { WolfCubRole } from '../roles/wolfCub.js';
import { AlphaWolfRole } from '../roles/alphaWolf.js';
import { HarlotRole } from '../roles/harlot.js';
import { ClumsyGuyRole } from '../roles/clumsyGuy.js';
import { ChemistRole } from '../roles/chemist.js';
import { ArsonistRole } from '../roles/arsonist.js';
import { CupidRole } from '../roles/cupid.js';
import type { RoleName } from '../types.js';

export const ROLE_REGISTRY: Record<RoleName, RoleDefinition> = {
  villager: VillagerRole,
  werewolf: WerewolfRole,
  seer: SeerRole,
  fool: FoolRole,
  doctor: DoctorRole,
  mason: MasonRole,
  sorcerer: SorcererRole,
  hunter: HunterRole,
  wolf_cub: WolfCubRole,
  alpha_wolf: AlphaWolfRole,
  harlot: HarlotRole,
  clumsy_guy: ClumsyGuyRole,
  chemist: ChemistRole,
  arsonist: ArsonistRole,
  cupid: CupidRole,
};

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === 'string' && value in ROLE_REGISTRY;
}
