import type { RoleDefinition, RoleIntroContext } from '../types.js';
import { WOLF_PACK_ROLES } from '../types.js';

export const AlphaWolfRole: RoleDefinition = {
  name: 'alpha_wolf',
  alignment: 'wolf',
  description:
    'The origin of the curse, the bane of banes. Leads the wolf pack and hunts each night like a standard werewolf. ' +
    'Each night there is a 20% chance the pack\'s chosen kill target is bitten and turns into a werewolf instead of dying — they join the pack immediately. ' +
    'The bite cannot trigger if the target is away from home, protected by the doctor, or already wolf-aligned. ' +
    'The bitten player is told their new role and packmates via DM; the pack is notified; ' +
    'the channel learns someone was turned but not who. ' +
    'Wolves know the identities of all other wolf pack members at game start.',
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
