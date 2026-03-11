import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const ClumsyGuyRole: RoleDefinition = {
  name: 'clumsy_guy',
  alignment: 'town',
  description:
    'No night action. During the day vote, the Clumsy Guy has a 50% chance of misfiring: ' +
    'their vote is silently redirected to a random alive player other than their intended target. ' +
    'The Clumsy Guy is not told when their vote misfires. ' +
    'Added to games with ~40% probability after the power budget is spent (min 6 players).',
  minPlayers: 6,
  unique: true,
  nightAction: {
    kind: 'none',
    target: 'none',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are the CLUMSY GUY. Maybe you should not have had so much alcohol for breakfast.\n' +
    "You can't see a damn thing, and when you try to vote during the day there's a 50% chance your vote will go to a random player instead of the one you picked.",
};

