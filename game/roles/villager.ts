import type { RoleDefinition } from '../types.js';

export const VillagerRole: RoleDefinition = {
  name: 'villager',
  alignment: 'town',
  description: 'An ordinary townsperson with no special powers. Tries to find and eliminate the werewolves.',
  dmIntro:
    'You are a VILLAGER. Your goal is to find and eliminate the werewolf.',
};
