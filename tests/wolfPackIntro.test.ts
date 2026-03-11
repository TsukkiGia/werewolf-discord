import { describe, it, expect } from 'vitest';
import { WerewolfRole } from '../game/roles/werewolf.js';
import { WolfCubRole } from '../game/roles/wolfCub.js';
import { AlphaWolfRole } from '../game/roles/alphaWolf.js';
import type { AssignedRole } from '../game/types.js';

// Helpers to build common player sets
const werewolf = (id: string): AssignedRole => ({ userId: id, role: 'werewolf', alignment: 'wolf' });
const wolfCub = (id: string): AssignedRole => ({ userId: id, role: 'wolf_cub', alignment: 'wolf' });
const alphaWolf = (id: string): AssignedRole => ({ userId: id, role: 'alpha_wolf', alignment: 'wolf' });
const sorcerer = (id: string): AssignedRole => ({ userId: id, role: 'sorcerer', alignment: 'wolf' });
const villager = (id: string): AssignedRole => ({ userId: id, role: 'villager', alignment: 'town' });

describe('Werewolf pack intro', () => {
  it('shows other wolf_core pack members', () => {
    const all = [werewolf('w1'), wolfCub('wc1'), villager('v1')];
    const intro = WerewolfRole.buildRoleIntro({ assignment: all[0]!, allAssignments: all });
    expect(intro).toContain('<@wc1>');
    expect(intro).not.toContain('<@w1>'); // not self
    expect(intro).not.toContain('<@v1>');
  });

  it('excludes sorcerer from pack reveal', () => {
    const all = [werewolf('w1'), sorcerer('sorc1'), villager('v1')];
    const intro = WerewolfRole.buildRoleIntro({ assignment: all[0]!, allAssignments: all });
    expect(intro).not.toContain('<@sorc1>');
    expect(intro).toContain('only wolf');
  });

  it('says only wolf when no other wolf_core members', () => {
    const all = [werewolf('w1'), sorcerer('sorc1'), villager('v1')];
    const intro = WerewolfRole.buildRoleIntro({ assignment: all[0]!, allAssignments: all });
    expect(intro).toContain('only wolf');
  });

  it('lists all three wolf_core roles when present', () => {
    const all = [werewolf('w1'), wolfCub('wc1'), alphaWolf('aw1'), sorcerer('sorc1')];
    const intro = WerewolfRole.buildRoleIntro({ assignment: all[0]!, allAssignments: all });
    expect(intro).toContain('<@wc1>');
    expect(intro).toContain('<@aw1>');
    expect(intro).not.toContain('<@sorc1>');
  });
});

describe('WolfCub pack intro', () => {
  it('shows other wolf_core pack members', () => {
    const all = [wolfCub('wc1'), werewolf('w1'), villager('v1')];
    const intro = WolfCubRole.buildRoleIntro({ assignment: all[0]!, allAssignments: all });
    expect(intro).toContain('<@w1>');
    expect(intro).not.toContain('<@wc1>'); // not self
    expect(intro).not.toContain('<@v1>');
  });

  it('excludes sorcerer from pack reveal', () => {
    const all = [wolfCub('wc1'), sorcerer('sorc1'), villager('v1')];
    const intro = WolfCubRole.buildRoleIntro({ assignment: all[0]!, allAssignments: all });
    expect(intro).not.toContain('<@sorc1>');
    expect(intro).toContain('only wolf');
  });

  it('identifies role correctly in intro', () => {
    const all = [wolfCub('wc1')];
    const intro = WolfCubRole.buildRoleIntro({ assignment: all[0]!, allAssignments: all });
    expect(intro).toContain('**wolf_cub**');
    expect(intro).toContain('WOLF CUB');
  });
});

describe('AlphaWolf pack intro', () => {
  it('shows other wolf_core pack members', () => {
    const all = [alphaWolf('aw1'), werewolf('w1'), wolfCub('wc1')];
    const intro = AlphaWolfRole.buildRoleIntro({ assignment: all[0]!, allAssignments: all });
    expect(intro).toContain('<@w1>');
    expect(intro).toContain('<@wc1>');
    expect(intro).not.toContain('<@aw1>'); // not self
  });

  it('excludes sorcerer from pack reveal', () => {
    const all = [alphaWolf('aw1'), sorcerer('sorc1'), villager('v1')];
    const intro = AlphaWolfRole.buildRoleIntro({ assignment: all[0]!, allAssignments: all });
    expect(intro).not.toContain('<@sorc1>');
    expect(intro).toContain('only wolf');
  });

  it('identifies role correctly in intro', () => {
    const all = [alphaWolf('aw1')];
    const intro = AlphaWolfRole.buildRoleIntro({ assignment: all[0]!, allAssignments: all });
    expect(intro).toContain('**alpha_wolf**');
    expect(intro).toContain('ALPHA WOLF');
  });
});
