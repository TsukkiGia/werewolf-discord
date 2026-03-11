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

  it('sorcerer gets wolf alignment (regression: was hardcoded to town)', () => {
    // Sorcerer appears at 7+ players; run many times to ensure it appears.
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    let found = false;

    for (let i = 0; i < 50; i++) {
      const assignments = assignRolesForPlayerIds(ids);
      const sorcerer = assignments.find((a) => a.role === 'sorcerer');
      if (sorcerer) {
        expect(sorcerer.alignment).toBe('wolf');
        found = true;
        break;
      }
    }

    expect(found).toBe(true);
  });

  it('hunter gets town alignment', () => {
    // Hunter appears at 6+ players.
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    let found = false;

    for (let i = 0; i < 50; i++) {
      const assignments = assignRolesForPlayerIds(ids);
      const hunter = assignments.find((a) => a.role === 'hunter');
      if (hunter) {
        expect(hunter.alignment).toBe('town');
        found = true;
        break;
      }
    }

    expect(found).toBe(true);
  });
});
