import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const DoctorRole: RoleDefinition = {
  name: 'doctor',
  alignment: 'town',
  description:
    'Protects one player from direct wolf or Serial Killer attacks each night. Can target themselves. ' +
    'Protection only works if the target is effectively at home — if the target is away (for example, the Harlot out visiting), ' +
    'the doctor cannot intercept the attack and no save is recorded. ' +
    'If the doctor protects a wolf pack member (werewolf, wolf_cub, alpha_wolf): ' +
    '75% chance the wolf retaliates and kills the doctor, unless the doctor was already killed by other means that night. ' +
    'Doctor protection does not block Chemist duels or Arsonist fire.',
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
    'You are the DOCTOR. Each night you choose one player to guard.\n' +
    '- If the wolves or the Serial Killer successfully attack them while they are home, you save their life.\n' +
    '- If you guard a wolf, there is a high chance they maul you in retaliation.\n' +
    '- Your protection does **not** stop Chemist duels or Arsonist fire.',
};
