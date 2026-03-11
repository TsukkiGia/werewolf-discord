import type { RoleName } from '../types.js';
import { ROLE_REGISTRY } from './roleRegistry.js';
import { validateSetup } from './validateSetup.js';

// ── Role groupings ────────────────────────────────────────────────────────────

const WOLF_PACK: RoleName[] = ['werewolf', 'wolf_cub', 'alpha_wolf'];

const NEUTRAL_ROLES: RoleName[] = ['arsonist'];

/**
 * Town power roles with their balance strength values.
 * Strength represents how much counter-power the role provides against the
 * wolf team. The budget system spends from this pool until the target budget
 * is reached or all eligible roles are exhausted.
 *
 * Masons are listed once but always generate two slots when selected (pair).
 */
const TOWN_POWER: { role: RoleName; strength: number }[] = [
  { role: 'seer', strength: 2.5 },
  { role: 'doctor', strength: 1.5 },
  { role: 'mason', strength: 2.0 }, // selected as a pair → 2 slots
  { role: 'hunter', strength: 1.0 },
  { role: 'harlot', strength: 0.75 },
  { role: 'chemist', strength: 1.25 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function isEligible(role: RoleName, playerCount: number): boolean {
  return playerCount >= (ROLE_REGISTRY[role].minPlayers ?? 0);
}

// ── Stage 1: team sizes ───────────────────────────────────────────────────────

/**
 * Wolf count scales as roughly 1 wolf per 5 players, with a minimum of 1.
 *   ≤5 players → 1 wolf
 *   6–10       → 2 wolves
 *   11–15      → 3 wolves
 *   16–20      → 4 wolves
 */
function getWolfCount(playerCount: number): number {
  return Math.max(1, Math.ceil(playerCount / 5));
}

/**
 * Neutral roles are introduced probabilistically in medium-to-large games.
 * They are never included below 8 players.
 */
function shouldIncludeNeutral(playerCount: number): boolean {
  if (playerCount < 8) return false;
  const chance = playerCount >= 14 ? 0.9 : playerCount >= 11 ? 0.7 : 0.5;
  return Math.random() < chance;
}

/**
 * Wolf pack composition rules:
 *   1 wolf  → always plain werewolf (alpha/cub are too volatile solo)
 *   2+ wolves → random mix from the full pack
 */
function pickWolves(count: number): RoleName[] {
  if (count === 1) return ['werewolf'];
  const pool = shuffle(WOLF_PACK);
  const picked: RoleName[] = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(pool[i % pool.length]!);
  }
  return picked;
}

function pickNeutral(playerCount: number): RoleName | null {
  const eligible = NEUTRAL_ROLES.filter((r) => isEligible(r, playerCount));
  if (eligible.length === 0) return null;
  return shuffle(eligible)[0]!;
}

// ── Stage 2: town power budget ────────────────────────────────────────────────

/**
 * Fill town power roles by spending a budget derived from the opposition
 * strength. Candidates are shuffled before selection so the exact role
 * combination varies between games.
 *
 * Budget formula:
 *   budget = wolfCount * 2.0 + 1.0 + (neutralAdded ? 1.5 : 0)
 *
 * Example outcomes:
 *   1 wolf, no neutral   → budget 3.0 → seer + doctor          (4.0 — slight over is fine)
 *   2 wolves, no neutral → budget 5.0 → seer + doctor + hunter  (5.0)
 *   2 wolves + neutral   → budget 6.5 → seer + doctor + masons  (6.0)
 *   3 wolves, no neutral → budget 7.0 → seer + doctor + masons + hunter (7.0)
 */
function pickTownPowerRoles(
  budget: number,
  playerCount: number,
  slotsAvailable: number,
): RoleName[] {
  const candidates = shuffle(
    TOWN_POWER.filter(({ role }) => isEligible(role, playerCount)),
  );

  const picked: RoleName[] = [];
  let spent = 0;
  let slotsLeft = slotsAvailable;

  for (const { role, strength } of candidates) {
    if (spent >= budget) break;
    const slots = role === 'mason' ? 2 : 1;
    if (slotsLeft < slots) continue;

    for (let i = 0; i < slots; i += 1) picked.push(role);
    spent += strength;
    slotsLeft -= slots;
  }

  // Clumsy guy: added as a chaos element with 40% probability after the
  // power budget is spent, if there is room and the game is large enough.
  if (slotsLeft >= 1 && isEligible('clumsy_guy', playerCount) && Math.random() < 0.4) {
    picked.push('clumsy_guy');
  }

  return picked;
}

// ── Main entry point ──────────────────────────────────────────────────────────

function attemptSetup(playerCount: number): RoleName[] | null {
  // Stage 1: determine team composition.
  const wolfCount = getWolfCount(playerCount);
  const includeNeutral = shouldIncludeNeutral(playerCount);

  const roles: RoleName[] = [];

  // Wolf pack — random mix of werewolf / wolf_cub / alpha_wolf.
  const wolves = pickWolves(wolfCount);
  roles.push(...wolves);

  // Sorcerer: guaranteed at 3+ wolves, 60% chance at exactly 2.
  if (wolfCount >= 3 && isEligible('sorcerer', playerCount)) {
    roles.push('sorcerer');
  } else if (wolfCount === 2 && isEligible('sorcerer', playerCount) && Math.random() < 0.6) {
    roles.push('sorcerer');
  }

  // Neutral faction — at most one, chosen probabilistically.
  let neutralAdded = false;
  if (includeNeutral) {
    const neutral = pickNeutral(playerCount);
    if (neutral) {
      roles.push(neutral);
      neutralAdded = true;
    }
  }

  // Stage 2: town power roles funded by the opposition budget.
  // Reserve at least 1 slot for a plain villager so the village core is
  // always represented.
  const alphaBonus = wolves.includes('alpha_wolf') ? 0.75 : 0;
  const budget = wolfCount * 2.0 + 1.0 + (neutralAdded ? 1.5 : 0) + alphaBonus;
  const powerRoles = pickTownPowerRoles(budget, playerCount, playerCount - roles.length - 1);
  roles.push(...powerRoles);

  // Fool: only appears in games that also contain a real Seer. Treated as
  // fake town power, so it does not spend from the power budget. Ensure we
  // still leave room for at least one plain villager.
  const hasSeer = roles.includes('seer');
  if (hasSeer && isEligible('fool', playerCount) && roles.length + 2 <= playerCount) {
    roles.push('fool');
  }

  // Fill any remaining slots with plain villagers.
  while (roles.length < playerCount) {
    roles.push('villager');
  }

  if (roles.length > playerCount) {
    roles.length = playerCount;
  }

  return validateSetup(roles) ? roles : null;
}

const MAX_SETUP_ATTEMPTS = 5;

export function chooseSetup(playerCount: number): RoleName[] {
  if (playerCount <= 0) return [];

  for (let attempt = 1; attempt <= MAX_SETUP_ATTEMPTS; attempt += 1) {
    const roles = attemptSetup(playerCount);
    if (roles !== null) return roles;
    console.error(`chooseSetup: attempt ${attempt}/${MAX_SETUP_ATTEMPTS} failed validation for ${playerCount} players, retrying…`);
  }

  throw new Error(
    `Failed to generate a valid role setup for ${playerCount} players after ${MAX_SETUP_ATTEMPTS} attempts.`,
  );
}
