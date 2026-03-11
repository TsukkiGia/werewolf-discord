import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const ClumsyGuyRole: RoleDefinition = {
  name: 'clumsy_guy',
  alignment: 'town',
  description:
    'A townsperson who partied a little too hard. During the day, they have a 50% chance for their lynch vote to land on a random player instead of their intended target.',
  nightAction: {
    kind: 'none',
    target: 'none',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are the CLUMSY GUY. Maybe you should not have had so much alcohol for breakfast.\n' +
    "You can't see a damn thing, and when you try to vote during the day there's a 50% chance your vote will go to a random player instead of the one you picked.",
};

