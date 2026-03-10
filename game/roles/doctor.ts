import type { RoleDefinition } from '../types.js';

export const DoctorRole: RoleDefinition = {
  name: 'doctor',
  alignment: 'town',
  description: 'A town-aligned role that can protect a player from being eliminated at night.',
  dmIntro:
    'You are the DOCTOR. Each night you may protect one player from being eliminated.',
  nightAction: {
    kind: 'protect',
    target: 'player',
    canTargetSelf: true,
  },
};
