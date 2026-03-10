import type { RoleDefinition } from '../types.js';

export const WerewolfRole: RoleDefinition = {
  name: 'werewolf',
  alignment: 'wolf',
  description: 'A werewolf who hunts at night and tries to avoid suspicion during the day.',
  dmIntro:
    'You are a WEREWOLF. Your goal is to eliminate the villagers without being discovered.',
};
