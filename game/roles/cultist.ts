import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const CultistRole: RoleDefinition = {
  name: 'cultist',
  alignment: 'cult',
  description:
    'Each night, cultists vote together to convert one player to the cult. ' +
    'That player loses their old role and becomes a cultist. ' +
    'Wolves are immune to conversion. ' +
    'If the cult targets the Cult Hunter, their newest member dies instead. ' +
    'The cult wins when all living players are cultists.',
  unique: false,
  minPlayers: 12,
  nightAction: {
    kind: 'convert',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: vote with your cult — choose a player to convert.',
  },
  buildRoleIntro: ({ assignment, allAssignments }: RoleIntroContext): string => {
    const cultmates = allAssignments
      .filter((a) => a.alignment === 'cult' && a.userId !== assignment.userId)
      .map((a) => `<@${a.userId}>`);

    const cultmatesLine =
      cultmates.length > 0
        ? `Your fellow cultists: ${cultmates.join(', ')}.`
        : 'You are the first and only cultist — for now.';

    return (
      `Your role for this Werewolf game is: **cultist**.\n` +
      'You are a CULTIST. Every night your cult votes together to convert one player. ' +
      'They lose their old role and join the cult. ' +
      'Wolves cannot be converted. If you target the Cult Hunter, your newest member dies instead. ' +
      'You win when every living player is a cultist.\n' +
      cultmatesLine
    );
  },
};
