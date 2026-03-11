export type RoleName = 'werewolf' | 'villager' | 'seer' | 'doctor' | 'mason';

export type Alignment = 'wolf' | 'town';

// High-level balancing buckets. These describe how a role is used when
// constructing setups, independent of its exact name.
export type RoleBucket =
  | 'village_core'
  | 'village_power_info'
  | 'village_power_protect'
  | 'wolf_core'
  | 'wolf_support'
  | 'neutral';

export interface AssignedRole {
  userId: string;
  role: RoleName;
  alignment: Alignment;
}

export interface RoleIntroContext {
  assignment: AssignedRole;
  allAssignments: AssignedRole[];
}

export type NightActionKind = 'none' | 'kill' | 'inspect' | 'protect';

export interface NightActionDefinition {
  kind: NightActionKind;
  // What kind of target this action expects; for now, just players vs none.
  target: 'player' | 'none';
  canTargetSelf?: boolean;
}

export interface RoleDefinition {
  name: RoleName;
  alignment: Alignment;
  description: string;
  nightAction: NightActionDefinition;
  /**
   * Build the DM text shown to a player at game start when their
   * role is revealed. Each role is responsible for its own intro.
   */
  buildRoleIntro: (ctx: RoleIntroContext) => string;
}
