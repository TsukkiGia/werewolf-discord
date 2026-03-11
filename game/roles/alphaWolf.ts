import type { RoleDefinition, RoleIntroContext } from '../types.js';
import { WOLF_PACK_ROLES } from '../types.js';

export const AlphaWolfRole: RoleDefinition = {
  name: 'alpha_wolf',
  alignment: 'wolf',
  description:
    'The pack leader who hunts alongside the other wolves. ' +
    'In a future version, the Alpha Wolf will have a chance to convert a villager into a wolf instead of killing them.',
  unique: true,
  nightAction: {
    kind: 'kill',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: choose a player to attack.',
  },
  buildRoleIntro: ({ assignment, allAssignments }: RoleIntroContext): string => {
    const base =
      'Your role for this Werewolf game is: **alpha_wolf**.\n' +
      'You are the ALPHA WOLF, leader of the pack. You hunt each night and command the wolves.';

    const packIds = allAssignments
      .filter((a) => WOLF_PACK_ROLES.has(a.role))
      .map((a) => a.userId);

    const others = packIds.filter((id) => id !== assignment.userId);
    if (others.length === 0) {
      return `${base}\nYou are the only wolf in this game.`;
    }

    const mentions = others.map((id) => `<@${id}>`).join(', ');
    return `${base}\nThe other wolves in your pack are: ${mentions}.`;
  },
};
