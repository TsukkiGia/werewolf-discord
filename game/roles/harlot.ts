import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const HarlotRole: RoleDefinition = {
  name: 'harlot',
  alignment: 'town',
  description:
    'A town-aligned role that visits another player each night. Visiting a wolf or the wolf\'s target is fatal, but being away means the wolf cannot kill you at home.',
  unique: true,
  nightAction: {
    kind: 'visit',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: choose a player to visit.',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are the HARLOT. Each night you may visit one player.\n' +
    '- If you visit a wolf, you will be killed.\n' +
    '- If you visit the player the wolves chose to kill, you will be killed.\n' +
    '- If the wolves come for you while you are away, you will survive (you weren\'t home).\n' +
    '- Otherwise, you will be told the player was not a wolf and return home safely.',
};
