import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const SorcererRole: RoleDefinition = {
  name: 'sorcerer',
  alignment: 'wolf',
  description:
    'A wolf-aligned information role that can learn whether a player is a wolf, the seer, or neither.',
  nightAction: {
    kind: 'inspect',
    target: 'player',
    canTargetSelf: false,
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are the SORCERER. Each night you may inspect a player to learn whether they are a wolf, the Seer, or neither. You win with the wolves.',
};

