import type { RoleDefinition, RoleIntroContext } from '../types.js';
import { WOLF_PACK_ROLES } from '../types.js';

export const WolfCubRole: RoleDefinition = {
  name: 'wolf_cub',
  alignment: 'wolf',
  description:
    'A young wolf who hunts alongside the pack. ' +
    'In a future version, the pack will get an extra kill the night after the Wolf Cub dies.',
  nightAction: {
    kind: 'kill',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: choose a player to attack.',
  },
  buildRoleIntro: ({ assignment, allAssignments }: RoleIntroContext): string => {
    const base =
      'Your role for this Werewolf game is: **wolf_cub**.\n' +
      'You are the WOLF CUB. You hunt alongside the pack each night.';

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
