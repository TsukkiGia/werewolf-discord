import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const HunterRole: RoleDefinition = {
  name: 'hunter',
  alignment: 'town',
  description:
    'No night action. When eliminated by any means (wolf kill or day lynch), ' +
    'the Hunter is immediately given the option to shoot one player, who also dies. ' +
    'The Hunter may also pass and shoot no one. ' +
    'The shot resolves before the next phase begins and win conditions are re-evaluated after the shot.',
  unique: true,
  minPlayers: 6,
  nightAction: {
    kind: 'none',
    target: 'none',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are the HUNTER. You have no night action, but when you are eliminated — whether by the wolves at night or by a day lynch — you may choose one player to shoot, who will also be eliminated.',
};
