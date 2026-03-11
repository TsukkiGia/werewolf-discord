import { describe, it, expect } from 'vitest';
import { assignRolesForPlayerIds } from '../game/engine/assignRoles.js';

describe('assignRolesForPlayerIds', () => {
  it('assigns exactly one werewolf and the rest town-aligned roles', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];

    const assignments = assignRolesForPlayerIds(ids);

    expect(assignments).toHaveLength(ids.length);

    const wolves = assignments.filter((a) => a.role === 'werewolf');
    const town = assignments.filter((a) => a.alignment === 'town');

    expect(wolves).toHaveLength(1);
    expect(town).toHaveLength(ids.length - 1);

    // Ensure every player id got a role.
    const assignedIds = new Set(assignments.map((a) => a.userId));
    ids.forEach((id) => expect(assignedIds.has(id)).toBe(true));
  });

  it('returns empty array when there are no players', () => {
    expect(assignRolesForPlayerIds([])).toEqual([]);
  });
});

