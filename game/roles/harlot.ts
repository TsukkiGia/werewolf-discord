import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const HarlotRole: RoleDefinition = {
  name: 'harlot',
  alignment: 'town',
  description:
    'Visits one player each night. Being away from home means wolves cannot kill the Harlot at their own house that night. ' +
    'Fatal outcomes: visiting a wolf pack member (werewolf/wolf_cub/alpha_wolf), ' +
    'or visiting the player the wolves chose to kill (even if the doctor saved that player). ' +
    'Safe visit: Harlot is told the visited player "was not a wolf"; ' +
    'the visited player is also notified that someone came by. ' +
    'The Harlot\'s survival depends on who they visit, not whether that player is home.',
  unique: true,
  minPlayers: 6,
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
