import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const FoolRole: RoleDefinition = {
  name: 'fool',
  alignment: 'town',
  description:
    'Believes they are the Seer, but their visions are nonsense. Each night they may inspect a player, ' +
    'but the result is a completely random role, unrelated to the target. They still count as town for win conditions.',
  unique: true,
  minPlayers: 5,
  nightAction: {
    kind: 'inspect',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: choose a player to inspect.',
  },
  buildRoleIntro: (_ctx: RoleIntroContext): string =>
    'Your role for this Werewolf game is: **seer**.\n' +
    'You are the SEER. Each night you may learn the exact role of one player.',
};

