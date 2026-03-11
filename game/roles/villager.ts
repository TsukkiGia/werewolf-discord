import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const VillagerRole: RoleDefinition = {
  name: 'villager',
  alignment: 'town',
  description: 'An ordinary townsperson with no special powers. Tries to find and eliminate the werewolves.',
  nightAction: {
    kind: 'none',
    target: 'none',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are a VILLAGER. Your goal is to find and eliminate the werewolf.',
};
