import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const DoctorRole: RoleDefinition = {
  name: 'doctor',
  alignment: 'town',
  description: 'A town-aligned role that can protect a player from being eliminated at night.',
  unique: true,
  nightAction: {
    kind: 'protect',
    target: 'player',
    canTargetSelf: true,
    prompt: 'Night {night}: choose a player to protect.',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are the DOCTOR. Each night you may protect one player from being eliminated.',
};
