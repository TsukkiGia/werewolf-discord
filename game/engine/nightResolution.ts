import type { GamePlayerState } from '../../db/players.js';
import type { NightActionRow } from '../../db/nightActions.js';
import { ROLE_REGISTRY, isRoleName } from '../balancing/roleRegistry.js';

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
  let isTie = false;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
      isTie = false;
    } else if (count === bestCount && bestId !== null) {
      isTie = true;
    }
  }

  if (isTie) return null;
  return bestId;
}

export type NightResolutionState = 'pending' | 'ready';

export interface NightResolutionResultPending {
  state: 'pending';
}

export interface HarlotVisit {
  harlotId: string;
  targetId: string;
}

export interface NightResolutionResultReady {
  state: 'ready';
  killTargets: string[];
  protectTargets: string[];
  visitActions: HarlotVisit[];
}

export type NightResolutionResult =
  | NightResolutionResultPending
  | NightResolutionResultReady;

/**
 * Evaluate whether the night phase is ready to be resolved and, if so,
 * compute the kill and protect target lists.
 *
 * Rules:
 * - Only alive players with a non-`none` nightAction are required actors.
 * - Night is "pending" until all required actors have an entry in night_actions.
 * - Once ready, returns the raw kill/protect targets derived from actions.
 */
export function evaluateNightResolution(
  players: GamePlayerState[],
  actions: NightActionRow[],
): NightResolutionResult {
  const requiredActors = players.filter((p) => {
    if (!p.is_alive) return false;
    if (!isRoleName(p.role)) return false;
    const def = ROLE_REGISTRY[p.role];
    return def.nightAction.kind !== 'none';
  });

  const requiredActorIds = new Set(requiredActors.map((p) => p.user_id));
  const actedIds = new Set(actions.map((a) => a.actor_id));

  for (const actorId of requiredActorIds) {
    if (!actedIds.has(actorId)) {
      return { state: 'pending' };
    }
  }

  const killTargets = actions
    .filter((a) => a.action_kind === 'kill' && a.target_id)
    .map((a) => a.target_id as string);

  const protectTargets = actions
    .filter((a) => a.action_kind === 'protect' && a.target_id)
    .map((a) => a.target_id as string);

  const visitActions: HarlotVisit[] = actions
    .filter((a) => a.action_kind === 'visit' && a.target_id)
    .map((a) => ({ harlotId: a.actor_id, targetId: a.target_id as string }));

  return {
    state: 'ready',
    killTargets,
    protectTargets,
    visitActions,
  };
}

