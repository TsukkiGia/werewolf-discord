import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const SeerRole: RoleDefinition = {
  name: 'seer',
  alignment: 'town',
  description: 'A town-aligned role that can learn the exact role of another player at night.',
  nightAction: {
    kind: 'inspect',
    target: 'player',
    canTargetSelf: false,
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are the SEER. Each night you may learn the exact role of one player.',
};
