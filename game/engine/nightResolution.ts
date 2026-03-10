/**
 * Choose the final night-kill victim from a list of target user IDs.
 *
 * Current behavior:
 * - No targets  -> null
 * - One target  -> that target
 * - Multiple    -> simple majority vote; highest count wins
 */
export function chooseKillVictim(killTargets: string[]): string | null {
  if (killTargets.length === 0) return null;
  if (killTargets.length === 1) {
    const first = killTargets[0];
    return first ?? null;
  }

  const counts = new Map<string, number>();
  for (const id of killTargets) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  let bestId: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  }

  return bestId;
}

