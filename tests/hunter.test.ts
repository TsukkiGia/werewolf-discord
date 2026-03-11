import { describe, it, expect } from 'vitest';
import { HunterRole } from '../game/roles/hunter.js';
import type { AssignedRole } from '../game/types.js';

const assignment: AssignedRole = { userId: 'h1', role: 'hunter', alignment: 'town' };

describe('HunterRole definition', () => {
  it('is town-aligned', () => {
    expect(HunterRole.alignment).toBe('town');
  });

  it('has no night action', () => {
    expect(HunterRole.nightAction.kind).toBe('none');
    expect(HunterRole.nightAction.target).toBe('none');
  });

  it('intro mentions the reactive shot ability', () => {
    const intro = HunterRole.buildRoleIntro({ assignment, allAssignments: [assignment] });
    expect(intro).toContain('HUNTER');
    expect(intro).toContain('shoot');
  });

  it('intro identifies the role', () => {
    const intro = HunterRole.buildRoleIntro({ assignment, allAssignments: [assignment] });
    expect(intro).toContain('**hunter**');
  });
});
