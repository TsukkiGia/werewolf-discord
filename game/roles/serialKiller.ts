import type { RoleDefinition, RoleIntroContext } from '../types.js';

export const SerialKillerRole: RoleDefinition = {
  name: 'serial_killer',
  alignment: 'neutral',
  description:
    'Neutral faction. Each night, you may choose any player to kill — wolves, villagers, or power roles. ' +
    'Your attacks ignore whether your target is home or away, but they are blocked if a doctor is guarding them at home. ' +
    'If the wolves hunt you, there is a small chance they finally bring you down, but most nights one of them will fall to your knife instead. ' +
    'Win condition: you must be the very last player alive (sole survivor), except for special Lover victories.',
  unique: true,
  minPlayers: 9,
  nightAction: {
    kind: 'murder',
    target: 'player',
    canTargetSelf: false,
    prompt:
      'Night {night}: choose someone to stalk and eliminate in the dark.',
  },
  buildRoleIntro: ({ assignment }: RoleIntroContext): string =>
    `Your role for this Werewolf game is: **${assignment.role}**.\n` +
    'You are THE SERIAL KILLER, freshly escaped and back to business.\n' +
    '- Each night, you may choose **any player** to kill — even wolves and other killers.\n' +
    '- Your knife finds people whether they are home or out for the night, but a vigilant doctor guarding them at home can still save their life.\n' +
    '- If the wolves ever come for you while you are home and unprotected, most nights **one of them** will die to your blade instead — but there\'s a small chance they finally tear you apart.\n' +
    '- You win only if you are the **last survivor** (Lover exceptions still apply).',
};

