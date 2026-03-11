import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const HunterRole: RoleDefinition = {
  name: 'hunter',
  alignment: 'town',
  description: 'A town-aligned role that can shoot one player when eliminated.',
  unique: true,
  nightAction: {
    kind: 'none',
    target: 'none',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are the HUNTER. You have no night action, but when you are eliminated — whether by the wolves at night or by a day lynch — you may choose one player to shoot, who will also be eliminated.',
};
