import type { RoleDefinition, RoleIntroContext } from '../types.js';
import { WOLF_PACK_ROLES } from '../types.js';

export const WerewolfRole: RoleDefinition = {
  name: 'werewolf',
  alignment: 'wolf',
  description:
    'Hunts with the wolf pack each night. The pack collectively submits a kill target via DM; ' +
    'if they disagree, a random vote from the pack is chosen. ' +
    'The kill is wasted if the chosen target is away from home that night, or if the target is protected by a doctor. ' +
    'Wolves know the identities of all other wolf pack members at game start. ' +
    'Wolves win when the number of alive wolves is greater than or equal to the number of alive town-aligned players.',
  nightAction: {
    kind: 'kill',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: choose a player to attack.',
  },
  buildRoleIntro: ({ assignment, allAssignments }: RoleIntroContext): string => {
    const base =
      'Your role for this Werewolf game is: **werewolf**.\n' +
      'You are a WEREWOLF. Your goal is to eliminate the villagers without being discovered.';

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
