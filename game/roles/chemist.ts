import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const ChemistRole: RoleDefinition = {
  name: 'chemist',
  alignment: 'town',
  description:
    'Acts on odd-numbered nights only (1, 3, 5, …). Chooses a target to share potions with. ' +
    'If the target is away from home (for example, a Harlot out visiting), the duel is cancelled and the Chemist is told the house was empty. ' +
    'If the target is home, a 50/50 coin flip determines who drinks the poison — ' +
    'the Chemist or the target. The loser dies; both players are DMed the outcome immediately. ' +
    'Doctor protection does not apply to Chemist duels. ' +
    'Town-aligned; wins with the town.',
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
    '- If your target is out for the night, nothing happens; you\'re told their house was empty.\n' +
    '- If they are home, one of you will definitely die from the poison, with a 50% chance that it will be **you**.\n' +
    '- The doctor cannot save anyone from this duel.',
};
