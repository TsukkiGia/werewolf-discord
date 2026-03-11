import type { RoleBucket, RoleName } from '../types.js';
import { validateSetup } from './validateSetup.js';
import { BUCKET_CONFIGS } from './buckets.js';

/**
 * Return all role names that belong to a given bucket according to
 * BUCKET_CONFIGS. This is the single source of truth for bucket membership.
 */
function getRolesInBucket(bucket: RoleBucket): RoleName[] {
  const cfg = BUCKET_CONFIGS.find((b) => b.id === bucket);
  return cfg ? cfg.roles : [];
}

/** Fisher-Yates shuffle — returns a new shuffled array, does not mutate. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Pick `count` concrete roles from the given bucket using random sampling.
 * The available roles are shuffled first so that unique-role buckets
 * (e.g. wolf_core with werewolf/wolf_cub/alpha_wolf) pick a random subset
 * rather than always the same ordered pair. If `count` exceeds the number
 * of distinct roles in the bucket the shuffled list wraps around.
 */
function pickFromBucket(bucket: RoleBucket, count: number): RoleName[] {
  const available = getRolesInBucket(bucket);
  if (count <= 0 || available.length === 0) return [];

  const pool = shuffle(available);
  const picked: RoleName[] = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(pool[i % pool.length]!);
  }
  return picked;
}

/**
 * Compute a full role setup for a given player count by:
 * 1) asking each bucket configuration how many slots it wants,
 * 2) sampling concrete roles for each bucket, and
 * 3) padding/trimming with village_core roles to match `playerCount`.
 *
 * All high-level balancing rules should live in BUCKET_CONFIGS and the
 * role registry, not in this function.
 */
export function chooseSetup(playerCount: number): RoleName[] {
  const roles: RoleName[] = [];

  if (playerCount <= 0) return roles;

  // First, compute how many slots each bucket receives using BUCKET_CONFIGS.
  const bucketCounts: Record<RoleBucket, number> = {
    village_core: 0,
    village_mason: 0,
    village_power_info: 0,
    village_power_protect: 0,
    village_power_reactive: 0,
    wolf_core: 0,
    wolf_support: 0,
    neutral: 0,
  };

  for (const cfg of BUCKET_CONFIGS) {
    const slots = cfg.slotCountForPlayers(playerCount, bucketCounts);
    bucketCounts[cfg.id] = Math.max(0, Math.floor(slots));
  }

  // Now sample concrete roles for each bucket based on its slot count.
  (Object.entries(bucketCounts) as [RoleBucket, number][]).forEach(
    ([bucket, count]) => {
      if (count > 0) {
        roles.push(...pickFromBucket(bucket, count));
      }
    },
  );

  // Safety net: if, due to configuration error, we under‑ or over‑shoot
  // the desired player count, pad/trim using village_core roles.
  if (roles.length < playerCount) {
    roles.push(...pickFromBucket('village_core', playerCount - roles.length));
  } else if (roles.length > playerCount) {
    roles.length = playerCount;
  }

  if (!validateSetup(roles)) {
    throw new Error('Generated role setup did not pass validation.');
  }

  return roles;
}
