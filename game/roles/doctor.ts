import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const DoctorRole: RoleDefinition = {
  name: 'doctor',
  alignment: 'town',
  description:
    'Protects one player from the wolf kill each night. Can target themselves. ' +
    'Protection only works if the target is at home — if the target is away (visiting someone else), ' +
    'the doctor spends the night in their empty house and no save is recorded. ' +
    'If the doctor protects a wolf pack member (werewolf, wolf_cub, alpha_wolf): ' +
    '75% chance the wolf retaliates and kills the doctor. ' +
    'If the wolf pack also targeted the doctor that same night, the wolf kill takes precedence ' +
    'and the retaliation roll is skipped. ' +
    'Doctor protection does not block chemist or arsonist kills.',
  unique: true,
  minPlayers: 5,
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
