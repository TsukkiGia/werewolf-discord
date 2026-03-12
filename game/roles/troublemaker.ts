import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const TroubleMakerRole: RoleDefinition = {
  name: 'troublemaker',
  alignment: 'town',
  description:
    'Town-aligned chaos role. Once per game, during the day, you can cause such a scene that the village resolves two lynches that day instead of one.',
  unique: true,
  minPlayers: 7,
  nightAction: {
    kind: 'none',
    target: 'none',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are THE TROUBLEMAKER, right on the edge of puberty.\n' +
    '- You have **no night powers**.\n' +
    '- Once per game, during a day, you may choose to **make trouble**.\n' +
    '- On that day, the village will attempt **two lynches** instead of one.\n' +
    '- The chaos is public, but your identity is not.',
};

