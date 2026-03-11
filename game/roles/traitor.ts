import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const TraitorRole: RoleDefinition = {
  name: 'traitor',
  alignment: 'town',
  description:
    'Town-aligned sleeper role. You count as town at the start of the game and have no night action. ' +
    'If you survive until all current wolves are dead, you secretly become a werewolf and turn against your former teammates.',
  unique: true,
  minPlayers: 7,
  nightAction: {
    kind: 'none',
    target: 'none',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are THE TRAITOR — a townsperson with a secret pull toward the curse.\n' +
    '- You are **town-aligned** at the start of the game and have **no night powers**.\n' +
    '- If you survive long enough for all existing wolves to die, you will **turn into a werewolf**.\n' +
    '- Once turned, your alignment becomes **wolf**, and you hunt at night with your new pack (or alone if no wolves remain).',
};
