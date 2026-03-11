import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const SorcererRole: RoleDefinition = {
  name: 'sorcerer',
  alignment: 'wolf',
  description:
    'Wolf-aligned spy who inspects one player per night. Gets a three-category result: ' +
    '"wolf-aligned", "the Seer", or "neither" — less precise than the Seer\'s exact role reveal. ' +
    'The Sorcerer is counted as wolf-aligned for win conditions and Seer inspections ' +
    '(a Seer who inspects the Sorcerer sees "sorcerer"). ' +
    'Does NOT count as a wolf pack member: doctor retaliation does not trigger when the doctor protects the Sorcerer, ' +
    'and the Sorcerer does not participate in the pack kill vote. ' +
    'Wins with the wolves.',
  unique: true,
  minPlayers: 9,
  nightAction: {
    kind: 'inspect',
    target: 'player',
    canTargetSelf: false,
    prompt: 'Night {night}: choose a player to inspect for wolves or the seer.',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are the SORCERER. Each night you may inspect a player to learn whether they are a wolf, the Seer, or neither. You win with the wolves.',
};
