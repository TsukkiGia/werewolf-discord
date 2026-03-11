import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const TannerRole: RoleDefinition = {
  name: 'tanner',
  alignment: 'neutral',
  description:
    'Neutral chaos role. You secretly hate your life and want the village to get it horribly wrong. ' +
    'You have no night action. Your only goal is to convince everyone to lynch you during the day. ' +
    'If you are lynched, you and only you win immediately; all other teams lose, regardless of who was ahead.',
  unique: true,
  minPlayers: 6,
  nightAction: {
    kind: 'none',
    target: 'none',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are THE TANNER, a miserable soul who secretly wants to die.\n' +
    '- You have **no night powers**.\n' +
    '- Your one objective is to be **lynched during the day**.\n' +
    '- If the village hangs you, you **instantly win the game alone** — everyone else loses, wolves and town alike.\n' +
    '- If you die any other way, you lose like everyone else.',
};

