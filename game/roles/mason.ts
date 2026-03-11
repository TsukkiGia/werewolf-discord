import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const MasonRole: RoleDefinition = {
  name: 'mason',
  alignment: 'town',
  description:
    'A townsperson who is part of a secret group. Masons know who the other masons are.',
  minPlayers: 8,
  nightAction: {
    kind: 'none',
    target: 'none',
  },
  buildRoleIntro: ({ assignment, allAssignments }: RoleIntroContext): string => {
    const base =
      'Your role for this Werewolf game is: **mason**.\n' +
      'You are a MASON. You and the other masons know each other and work together to help the town.';

    const masonIds = allAssignments
      .filter((a) => a.role === 'mason')
      .map((a) => a.userId);

    const others = masonIds.filter((id) => id !== assignment.userId);
    if (others.length === 0) {
      return `${base}\nYou are currently the only Mason in this game.`;
    }

    const mentions = others.map((id) => `<@${id}>`).join(', ');
    return `${base}\nThe other masons in this game are: ${mentions}.`;
  },
};
