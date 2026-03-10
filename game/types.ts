export type RoleName = 'werewolf' | 'villager' | 'seer' | 'doctor';

export type Alignment = 'wolf' | 'town';

export interface AssignedRole {
  userId: string;
  role: RoleName;
  alignment: Alignment;
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
  dmIntro: string;
  nightAction: NightActionDefinition;
}
