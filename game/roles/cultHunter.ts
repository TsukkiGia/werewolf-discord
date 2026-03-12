import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const CultHunterRole: RoleDefinition = {
  name: 'cult_hunter',
  alignment: 'town',
  description:
    'Each night, the Cult Hunter may target one player. ' +
    'If that player is a cultist, they are eliminated. ' +
    'If the cult tries to convert the Cult Hunter, their newest member dies instead.',
  unique: true,
  minPlayers: 12,
  nightAction: {
    kind: 'hunt',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: choose a player to hunt — if they are a cultist, they will die.',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **cult_hunter**.\n` +
    'You are the CULT HUNTER. Each night you may target one player. ' +
    'If they are a cultist, they are eliminated. ' +
    'You are also protected: if the cult ever targets you for conversion, ' +
    'their newest member dies in your place.',
};
