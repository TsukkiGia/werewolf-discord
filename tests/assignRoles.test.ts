import { describe, it, expect } from 'vitest';
import { assignRolesForPlayerIds } from '../game/engine/assignRoles.js';

describe('assignRolesForPlayerIds', () => {
  it('assigns a reasonable mix of wolf and town roles', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];

    const assignments = assignRolesForPlayerIds(ids);

    expect(assignments).toHaveLength(ids.length);

    const wolves = assignments.filter((a) => a.alignment === 'wolf');
    const town = assignments.filter((a) => a.alignment === 'town');

    // For 5 players we expect at least one wolf-aligned role
    // and at least two town-aligned roles.
    expect(wolves.length).toBeGreaterThanOrEqual(1);
    expect(town.length).toBeGreaterThanOrEqual(2);

    // Ensure every player id got a role.
    const assignedIds = new Set(assignments.map((a) => a.userId));
    ids.forEach((id) => expect(assignedIds.has(id)).toBe(true));
  });

  it('returns empty array when there are no players', () => {
    expect(assignRolesForPlayerIds([])).toEqual([]);
  });
});
