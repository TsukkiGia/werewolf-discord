import type { RoleDefinition } from '../types.js';

export const SeerRole: RoleDefinition = {
  name: 'seer',
  alignment: 'town',
  description: 'A town-aligned role that can learn the exact role of another player at night.',
  dmIntro:
    'You are the SEER. Each night you may learn the exact role of one player.',
};
