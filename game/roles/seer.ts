import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const SeerRole: RoleDefinition = {
  name: 'seer',
  alignment: 'town',
  description:
    'Inspects one player each night and learns their exact role (e.g. "werewolf", "doctor", "sorcerer"). ' +
    'Inspection reveals the role name directly, not just alignment — ' +
    'so the Seer sees through the Alpha Wolf\'s disguise and correctly identifies the Sorcerer as "sorcerer". ' +
    'Results are DMed at dawn after night resolution.',
  unique: true,
  minPlayers: 5,
  nightAction: {
    kind: 'inspect',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: choose a player to inspect.',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are the SEER. Each night you may learn the exact role of one player.',
};
