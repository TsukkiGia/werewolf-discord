import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const ChemistRole: RoleDefinition = {
  name: 'chemist',
  alignment: 'town',
  description:
    'A crazy villager who brews dangerous potions. On certain nights they can share their brews with another player, and one of them will die from the poison.',
  unique: true,
  minPlayers: 7,
  nightAction: {
    kind: 'potion',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: choose a player to share your potions with.',
  },
  // Allow the Chemist to act on odd‑numbered nights (1, 3, 5, ...).
  isNightActionRequired: ({ nightNumber }) => nightNumber % 2 === 1,
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are THE CHEMIST, a crazy villager who loves to brew potions.\n' +
    'Each night you brew two potions: one poisonous, one harmless.\n' +
    'On every other night (starting with Night 1), you may visit another player to share a drink — they randomly pick one potion and you drink the other.\n' +
    'One of you will definitely die from the poison, and there is a 50% chance that it will be YOU.',
};

