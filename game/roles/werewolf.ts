import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const WerewolfRole: RoleDefinition = {
  name: 'werewolf',
  alignment: 'wolf',
  description: 'A werewolf who hunts at night and tries to avoid suspicion during the day.',
  nightAction: {
    kind: 'kill',
    target: 'player',
    canTargetSelf: false,
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are a WEREWOLF. Your goal is to eliminate the villagers without being discovered.',
};
