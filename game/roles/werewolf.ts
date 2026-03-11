import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const WerewolfRole: RoleDefinition = {
  name: 'werewolf',
  alignment: 'wolf',
  description: 'A werewolf who hunts at night and tries to avoid suspicion during the day.',
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

    const wolfIds = allAssignments
      .filter((a) => a.role === 'werewolf')
      .map((a) => a.userId);

    const others = wolfIds.filter((id) => id !== assignment.userId);
    if (others.length === 0) {
      return `${base}\nYou are currently the only werewolf in this game.`;
    }

    const mentions = others.map((id) => `<@${id}>`).join(', ');
    return `${base}\nThe other werewolves in this game are: ${mentions}.`;
  },
};
