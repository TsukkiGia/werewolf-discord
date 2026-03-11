import { describe, it, expect } from 'vitest';
import type { AssignedRole } from '../game/types.js';
import { ROLE_REGISTRY } from '../game/balancing/roleRegistry.js';
import { buildRoleIntroForAssignment } from '../game/engine/dmRoles.js';

describe('buildRoleIntroForAssignment', () => {
  it('uses generic intro for roles without a custom hook (villager)', () => {
    const assignments: AssignedRole[] = [
      { userId: 'v1', role: 'villager', alignment: 'town' },
    ];

    const intro = buildRoleIntroForAssignment(assignments[0]!, assignments);

    expect(intro).toContain(
      'Your role for this Werewolf game is: **villager**.',
    );
    expect(intro).toContain('You are a VILLAGER.');
  });

  it('includes other masons in mason intro when multiple masons exist', () => {
    const assignments: AssignedRole[] = [
      { userId: 'm1', role: 'mason', alignment: 'town' },
      { userId: 'm2', role: 'mason', alignment: 'town' },
      { userId: 'v1', role: 'villager', alignment: 'town' },
    ];

    const introM1 = buildRoleIntroForAssignment(assignments[0]!, assignments);
    const introM2 = buildRoleIntroForAssignment(assignments[1]!, assignments);
    const introV1 = buildRoleIntroForAssignment(assignments[2]!, assignments);

    expect(introM1).toContain('<@m2>');
    expect(introM1).not.toContain('<@m1>');

    expect(introM2).toContain('<@m1>');
    expect(introM2).not.toContain('<@m2>');

    expect(introV1).not.toContain('other masons in this game');
  });

  it('mentions being the only mason when there is a single mason', () => {
    const assignments: AssignedRole[] = [
      { userId: 'm1', role: 'mason', alignment: 'town' },
      { userId: 'v1', role: 'villager', alignment: 'town' },
    ];

    const intro = buildRoleIntroForAssignment(assignments[0]!, assignments);
    expect(intro).toContain('only Mason in this game');
  });
});
