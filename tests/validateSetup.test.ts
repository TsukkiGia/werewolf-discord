import { describe, it, expect } from 'vitest';
import { validateSetup } from '../game/balancing/validateSetup.js';

describe('validateSetup', () => {
  it('accepts a valid small setup', () => {
    expect(validateSetup(['werewolf', 'seer', 'villager'])).toBe(true);
  });

  it('rejects a setup with no wolves (3+ players)', () => {
    expect(validateSetup(['villager', 'villager', 'villager'])).toBe(false);
  });

  it('accepts duplicate villagers (not unique)', () => {
    expect(validateSetup(['werewolf', 'villager', 'villager'])).toBe(true);
  });

  it('accepts duplicate werewolves (not unique)', () => {
    expect(validateSetup(['werewolf', 'werewolf', 'villager', 'villager'])).toBe(true);
  });

  it('accepts duplicate masons (not unique)', () => {
    expect(validateSetup(['werewolf', 'mason', 'mason', 'villager'])).toBe(true);
  });

  it('rejects duplicate seer', () => {
    expect(validateSetup(['werewolf', 'seer', 'seer', 'villager'])).toBe(false);
  });

  it('rejects duplicate doctor', () => {
    expect(validateSetup(['werewolf', 'doctor', 'doctor', 'villager'])).toBe(false);
  });

  it('rejects duplicate hunter', () => {
    expect(validateSetup(['werewolf', 'hunter', 'hunter', 'villager'])).toBe(false);
  });

  it('rejects duplicate sorcerer', () => {
    expect(validateSetup(['werewolf', 'sorcerer', 'sorcerer', 'villager'])).toBe(false);
  });

  it('rejects duplicate wolf_cub', () => {
    expect(validateSetup(['wolf_cub', 'wolf_cub', 'villager', 'villager'])).toBe(false);
  });

  it('rejects duplicate alpha_wolf', () => {
    expect(validateSetup(['alpha_wolf', 'alpha_wolf', 'villager', 'villager'])).toBe(false);
  });
});
