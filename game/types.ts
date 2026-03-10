export type RoleName = 'werewolf' | 'villager' | 'seer' | 'doctor';

export type Alignment = 'wolf' | 'town';

export interface AssignedRole {
  userId: string;
  role: RoleName;
  alignment: Alignment;
}

export interface RoleDefinition {
  name: RoleName;
  alignment: Alignment;
  description: string;
  dmIntro: string;
}
