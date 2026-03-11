import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const ThiefRole: RoleDefinition = {
  name: 'thief',
  alignment: 'town',
  description:
    'On the first night, steals another player\'s role. The target becomes a plain Villager. ' +
    'If the stolen role is wolf-aligned, the Thief becomes wolf-aligned too.',
  unique: true,
  minPlayers: 6,
  nightAction: {
    kind: 'steal',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: choose a player to steal their role.',
  },
  isNightActionRequired: ({ nightNumber }) => nightNumber === 1,
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are the THIEF. On the first night, you must steal another player\'s role. ' +
    'They will become a plain Villager, and you will take on their role and alignment. ' +
    'If you steal a wolf\'s role, you join the wolf team. Choose your mark wisely.',
};
