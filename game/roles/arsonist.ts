import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const ArsonistRole: RoleDefinition = {
  name: 'arsonist',
  alignment: 'neutral',
  description:
    'A lone neutral who drenches houses in kerosene. Each night they may douse a house, and later ignite all doused houses in one inferno.',
  unique: true,
  minPlayers: 9,
  nightAction: {
    kind: 'potion',
    target: 'player',
    canTargetSelf: false,
    prompt:
      'Night {night}: choose a house to douse with kerosene. If you have already doused at least one house, you may instead ignite them all.',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are THE ARSONIST, a lone maniac who loves kerosene.\n' +
    '- Every night, you may douse one player’s house in kerosene.\n' +
    '- Once one or more houses are doused, you may choose to **ignite** instead of dousing, burning every doused house at once.\n' +
    '- Everyone in those houses dies — including any visitors.\n' +
    '- You win only if you are the **last player alive**.',
};

