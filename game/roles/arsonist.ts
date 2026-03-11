import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const ArsonistRole: RoleDefinition = {
  name: 'arsonist',
  alignment: 'neutral',
  description:
    'Neutral faction. Each night: choose to douse a player\'s house (adds to a persistent list) ' +
    'or, if at least one house is already doused, ignite all of them at once. ' +
    'Ignition kills everyone in or visiting a doused house — the occupant (whether home or away), ' +
    'plus any visitors whose night action targeted that house (doctor, harlot, chemist, etc.). ' +
    'Doctor protection does not block arsonist fire. ' +
    'The doused list persists across nights and is cleared after ignition. ' +
    'Win condition: must be the very last player alive (sole survivor). ' +
    'Does not win alongside the wolf team — all other players must be dead.',
  unique: true,
  minPlayers: 9,
  nightAction: {
    kind: 'potion',
    target: 'player',
    canTargetSelf: false,
    prompt:
      'Night {night}: choose a house to douse with kerosene. If you have already doused at least one house, you may instead ignite them all.',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are THE ARSONIST, a lone maniac who loves kerosene.\n' +
    '- Every night, you may douse one player’s house in kerosene.\n' +
    '- Once one or more houses are doused, you may choose to **ignite** instead of dousing, burning every doused house at once.\n' +
    '- Everyone in those houses dies — including any visitors.\n' +
    '- You win only if you are the **last player alive**.',
};

