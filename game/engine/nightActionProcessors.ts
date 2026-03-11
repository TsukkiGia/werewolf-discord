import type { NightActionRow } from '../../db/nightActions.js';
import type { GamePlayerState } from '../../db/players.js';
import { markPlayerDead, setPlayerRoleAndAlignment } from '../../db/players.js';
import { WOLF_PACK_ROLES, type RoleName, type Alignment, type NightActionKind } from '../types.js';
import { ROLE_REGISTRY } from '../balancing/roleRegistry.js';
import type { HarlotVisit } from './nightResolution.js';
import { openDmChannel, postChannelMessage } from '../../utils.js';
import {
  harlotVisitedWolfLine,
  harlotVisitedTargetLine,
  harlotSafeVisitLine,
  harlotVisitNotificationLine,
  thiefNewRoleDmLine,
  thiefTargetDmLine,
} from '../strings/narration.js';
import { addDousedTarget, clearDousedTargets, getDousedTargets } from '../../db/arsonist.js';

async function safeDm(userId: string, content: string, context: string): Promise<void> {
  try {
    const dmChannelId = await openDmChannel(userId);
    await postChannelMessage(dmChannelId, { content });
  } catch (err) {
    console.error(`Failed to DM ${context}`, userId, err);
  }
}

function buildPlayersById(players: GamePlayerState[]): Map<string, GamePlayerState> {
  const map = new Map<string, GamePlayerState>();
  for (const p of players) {
    map.set(p.user_id, p);
  }
  return map;
}

const AWAY_ACTION_KINDS: NightActionKind[] = ['visit', 'kill', 'potion', 'protect', 'steal'];

export function buildAwayPlayerIds(actions: NightActionRow[]): Set<string> {
  const away = new Set<string>();
  for (const action of actions) {
    if (!action.target_id) continue;
    if (AWAY_ACTION_KINDS.includes(action.action_kind)) {
      away.add(action.actor_id);
    }
  }
  return away;
}

/**
 * Process all seer-type night actions by DMing inspection results.
 * Players is the pre-kill snapshot so seers always receive their result,
 * even if their target is killed later the same night.
 */
export async function processSeerActions(
  players: GamePlayerState[],
  actions: NightActionRow[],
): Promise<void> {
  const playersById = buildPlayersById(players);
  const inspectActions = actions.filter(
    (a) => a.action_kind === 'inspect' && a.target_id,
  );

  await Promise.all(
    inspectActions.map(async (action) => {
      const target = playersById.get(action.target_id as string);
      if (!target) return;

      const userTag = `<@${target.user_id}>`;
      const isWolf = target.alignment === 'wolf';
      const isSeer = target.role === 'seer';

      let content: string;

      switch (action.role) {
        case 'sorcerer': {
          if (isWolf) {
            content = `Your vision reveals that ${userTag} is aligned with the **wolves**.`;
          } else if (isSeer) {
            content = `Your vision reveals that ${userTag} is the **Seer**.`;
          } else {
            content = `Your vision reveals that ${userTag} is neither a wolf nor the Seer.`;
          }
          break;
        }

        case 'seer': {
          const revealedRole = target.role;
          content = `Your vision reveals that ${userTag} is **${revealedRole}**.`;
          break;
        }

        case 'fool': {
          // Fool: completely random role result, independent of the target.
          const allRoles = Object.keys(ROLE_REGISTRY) as RoleName[];
          const randomRole =
            allRoles[Math.floor(Math.random() * allRoles.length)]!;
          content = `Your vision reveals that ${userTag} is **${randomRole}**.`;
          break;
        }

        default: {
          // Any other inspect-capable role (future-proof fallback)
          content = `Your vision reveals that ${userTag} is **${target.role}**.`;
          break;
        }
      }

      await safeDm(action.actor_id, content, 'seer inspection result');
    }),
  );
}

export interface DoctorActionResult {
  anySaved: boolean;
  /** IDs of doctors killed by wolf retaliation (protected a wolf, 50% death roll). */
  killedDoctorId: string | null;
  doctorDeathInfo: { doctorId: string; wolfTargetId: string } | null;
}

/**
 * Process doctor-type actions.
 *
 * - If the doctor targeted a wolf: 50% chance the wolf kills the doctor in
 *   retaliation. The doctor is DM'd either way, and the channel is notified
 *   if they die.
 * - If the doctor targeted a non-wolf who was attacked and survived *at home*:
 *   they are considered saved and a rumor line is added at dawn.
 * - If the doctor targeted a non-wolf who wasn't attacked: quiet night.
 * - If the doctor targeted someone who was out for the night (based on
 *   `buildAwayPlayerIds`), the protection fizzles — the doc is told the
 *   house was empty and no save is recorded.
 */
export async function processDoctorActions(
  players: GamePlayerState[],
  actions: NightActionRow[],
  killTargets: string[],
  killedIds: string[],
): Promise<DoctorActionResult> {
  const playersById = buildPlayersById(players);
  const protectActions = actions.filter(
    (a) => a.action_kind === 'protect' && a.target_id,
  );

  let anySaved = false;
  let killedDoctorId: string | null = null;
  let doctorDeathInfo: { doctorId: string; wolfTargetId: string } | null = null;

  const awayPlayerIds = buildAwayPlayerIds(actions);

  await Promise.all(
    protectActions.map(async (action) => {
      const target = playersById.get(action.target_id as string);
      if (!target) return;

      const targetId = target.user_id;
      const doctorId = action.actor_id;

      // Doctor tried to protect a wolf — risky move.
      // If the wolf also targeted the doctor this night, the wolf kill already
      // resolved first (killedIds is populated before this runs). Skip the
      // retaliation roll — the doctor is already dead.
      if (WOLF_PACK_ROLES.has(target.role as RoleName)) {
        if (killedIds.includes(doctorId)) return;

        const doctorDies = Math.random() < 0.75;
        if (doctorDies) {
          await markPlayerDead(action.game_id, doctorId);
          killedDoctorId = doctorId;
          doctorDeathInfo = { doctorId, wolfTargetId: targetId };
        }
        const content = doctorDies
          ? `You tried to protect <@${targetId}>, but they were a wolf in disguise. They turned on you — you did not survive.`
          : `You tried to protect <@${targetId}>, but they were a wolf in disguise. They lunged for you, but you escaped with your life.`;
        await safeDm(doctorId, content, 'doctor wolf-protection result');
        return;
      }

      // Standard protection — target is not a wolf.
      const isSelf = targetId === doctorId;
      const targetAway = !isSelf && awayPlayerIds.has(targetId);

      // Body-based protection: if the target is out for the night, the doctor
      // can't actually shield them. The doc still gets a DM, but no save is
      // recorded.
      let saved = false;
      if (!targetAway) {
        saved = killTargets.includes(targetId) && !killedIds.includes(targetId);
        if (saved) anySaved = true;
      }

      const content = isSelf
        ? saved
          ? 'You guarded yourself tonight. The wolves came for you, but your defenses held.'
          : 'You guarded yourself tonight. The wolves never came.'
        : targetAway
          ? `You went to guard <@${targetId}>, but they were out for the night. You spent the night in their empty house.`
          : saved
            ? `You watched over <@${targetId}>. The wolves struck, but your protection held.`
            : `You watched over <@${targetId}>. The night passed quietly.`;

      await safeDm(doctorId, content, 'doctor protection result');
    }),
  );

  return { anySaved, killedDoctorId, doctorDeathInfo };
}

/**
 * Process harlot visit actions.
 *
 * - Visiting a wolf-core player: harlot is killed.
 * - Visiting the wolf's chosen kill target (regardless of whether doctor saved them): harlot is killed.
 * - Otherwise: harlot survives and is told the visited player was not a wolf.
 *
 * The "not home" mechanic (wolves targeting a visiting harlot) is handled
 * upstream in the orchestrator before this function is called.
 */
export interface HarlotActionResult {
  killedHarlotIds: string[];
  harlotDeathInfos: { harlotId: string; targetId: string; cause: 'visited_wolf' | 'visited_victim' }[];
}

export async function processHarlotActions(
  players: GamePlayerState[],
  visitActions: HarlotVisit[],
  wolfChosenVictimIds: string[],
  gameId: string,
  awayPlayerIds: Set<string>,
): Promise<HarlotActionResult> {
  const playersById = buildPlayersById(players);
  const killedHarlotIds: string[] = [];
  const harlotDeathInfos: { harlotId: string; targetId: string; cause: 'visited_wolf' | 'visited_victim' }[] = [];

  await Promise.all(
    visitActions.map(async (visit) => {
      const { harlotId, targetId } = visit;
      const target = playersById.get(targetId);
      if (!target) return;

      const targetAway = awayPlayerIds.has(targetId);
      const visitedWolf = WOLF_PACK_ROLES.has(target.role as RoleName) && !targetAway;
      const visitedWolfTarget = wolfChosenVictimIds.includes(targetId);

      let dmContent: string;

      if (visitedWolf) {
        await markPlayerDead(gameId, harlotId);
        killedHarlotIds.push(harlotId);
        harlotDeathInfos.push({ harlotId, targetId, cause: 'visited_wolf' });
        dmContent = harlotVisitedWolfLine(targetId);
      } else if (visitedWolfTarget) {
        await markPlayerDead(gameId, harlotId);
        killedHarlotIds.push(harlotId);
        harlotDeathInfos.push({ harlotId, targetId, cause: 'visited_victim' });
        dmContent = harlotVisitedTargetLine(targetId);
      } else {
        dmContent = harlotSafeVisitLine(targetId);
      }

      await safeDm(harlotId, dmContent, 'harlot visit result');

      // Notify the visited player (only on safe visits — dead players don't get DMs)
      if (!visitedWolf && !visitedWolfTarget) {
        await safeDm(targetId, harlotVisitNotificationLine(), 'harlot visit notification to target');
      }
    }),
  );

  return { killedHarlotIds, harlotDeathInfos };
}

export interface ChemistDuelInfo {
  chemistId: string;
  targetId: string;
  victimId: string;
}

export interface ChemistActionResult {
  killedIds: string[];
  duels: ChemistDuelInfo[];
}

/**
 * Process Chemist potion-share actions.
 *
 * For each alive Chemist with a `potion` action:
 * - They choose a target player who is at home.
 * - If the target is away for the night, the duel does not happen and the
 *   Chemist is told their target was out.
 * - Otherwise, one of the two (Chemist or target) dies with 50% probability.
 *
 * Doctor protection does not apply to these deaths.
 */
export async function processChemistActions(
  players: GamePlayerState[],
  actions: NightActionRow[],
  nightNumber: number,
  gameId: string,
  killedIds: string[],
): Promise<ChemistActionResult> {
  const killedByChemist: string[] = [];
  const duels: ChemistDuelInfo[] = [];

  const awayPlayerIds = buildAwayPlayerIds(actions);
  const playersById = buildPlayersById(players);

  const chemists = players.filter((p) => p.is_alive && p.role === 'chemist');
  if (chemists.length === 0) {
    return { killedIds: killedByChemist, duels };
  }

  for (const chemist of chemists) {
    // If the Chemist was already killed earlier this night (e.g. by wolves),
    // skip their duel.
    if (killedIds.includes(chemist.user_id)) continue;

    const action = actions.find(
      (a) =>
        a.actor_id === chemist.user_id &&
        a.action_kind === 'potion' &&
        a.target_id,
    );
    if (!action || !action.target_id) continue;

    const target = playersById.get(action.target_id);
    if (!target || !target.is_alive) continue;

    const chemistId = chemist.user_id;
    const targetId = target.user_id;

    // If the target is out for the night, the duel never happens.
    if (awayPlayerIds.has(targetId)) {
      await safeDm(
        chemistId,
        `You went looking for <@${targetId}> to share your potions, but they were out for the night. Your vials stayed corked.`,
        'chemist away-target result',
      );
      continue;
    }

    const chemistDies = Math.random() < 0.5;
    const victimId = chemistDies ? chemistId : targetId;

    await markPlayerDead(gameId, victimId);
    killedByChemist.push(victimId);
    duels.push({ chemistId, targetId, victimId });

    // DM both players about the outcome.
    const chemistContent = chemistDies
      ? `You visited <@${targetId}> to share your potions. They grabbed the safe one. You drank the poison and died.`
      : `You visited <@${targetId}> to share your potions. They chose poorly and drank the poison. You survived.`;

    const targetContent = chemistDies
      ? `The Chemist visited you for a late-night drink. You picked the safe potion — they took the poison and died.`
      : `The Chemist visited you for a late-night drink. You chose the wrong potion and died from the poison.`;

    await safeDm(chemistId, chemistContent, 'chemist potion result');
    await safeDm(targetId, targetContent, 'chemist target potion result');
  }

  return { killedIds: killedByChemist, duels };
}

export interface BurnedVictimInfo {
  victimId: string;
  kind: 'occupant_home' | 'occupant_away' | 'visitor';
}

export interface ArsonistActionResult {
  killedIds: string[];
  burnedVictims: BurnedVictimInfo[];
}

/**
 * Process Arsonist actions.
 *
 * - On a "douse" night, the Arsonist targets a player and their house is added
 *   to the persistent doused set for the game.
 * - On an "ignite" night, the Arsonist targets the special value "__ARSONIST_IGNITE__".
 *   All doused houses are burned, killing the occupants and any visitors:
 *   - The doused player themselves.
 *   - Any doctors protecting that player.
 *   - Any visitors whose action targets that player.
 *
 * Doctor protection does not prevent arsonist kills.
 */
export async function processArsonistActions(
  gameId: string,
  players: GamePlayerState[],
  actions: NightActionRow[],
  killedIds: string[],
): Promise<ArsonistActionResult> {
  const arsonists = players.filter((p) => p.is_alive && p.role === 'arsonist');
  if (arsonists.length === 0) {
    return { killedIds: [], burnedVictims: [] };
  }

  const arsonist = arsonists[0]!;
  const action = actions.find(
    (a) => a.actor_id === arsonist.user_id && a.role === 'arsonist',
  );

  if (!action) {
    return { killedIds: [], burnedVictims: [] };
  }

  const currentDoused = await getDousedTargets(gameId);
  const awayPlayerIds = buildAwayPlayerIds(actions);

  // Ignite all doused houses
  if (action.action_kind === 'ignite') {
    if (currentDoused.length === 0) {
      return { killedIds: [], burnedVictims: [] };
    }

    const killedByFire: string[] = [];
    const burnedKinds = new Map<string, BurnedVictimInfo['kind']>();

    for (const houseId of currentDoused) {
      if (killedIds.includes(houseId)) continue;

      const occupantOut = awayPlayerIds.has(houseId);
      burnedKinds.set(houseId, occupantOut ? 'occupant_away' : 'occupant_home');

      for (const a of actions) {
        if (
          (a.action_kind === 'protect' ||
            a.action_kind === 'visit' ||
            a.action_kind === 'potion' ||
            a.action_kind === 'steal') &&
          a.target_id === houseId
        ) {
          if (!burnedKinds.has(a.actor_id) && !killedIds.includes(a.actor_id)) {
            burnedKinds.set(a.actor_id, 'visitor');
          }
        }
      }
    }

    for (const victimId of burnedKinds.keys()) {
      if (!killedIds.includes(victimId)) {
        await markPlayerDead(gameId, victimId);
        killedByFire.push(victimId);
      }
    }

    await clearDousedTargets(gameId);

    const burnedVictims: BurnedVictimInfo[] = Array.from(burnedKinds.entries()).map(
      ([victimId, kind]) => ({ victimId, kind }),
    );

    return { killedIds: killedByFire, burnedVictims };
  }

  // Otherwise this night is a douse.
  if (action.target_id) {
    await addDousedTarget(gameId, action.target_id);
    await safeDm(
      arsonist.user_id,
      `You quietly drenched <@${action.target_id}>’s house in kerosene. It will stay primed until you choose to ignite.`,
      'arsonist douse result',
    );
  }

  return { killedIds: [], burnedVictims: [] };
}

/**
 * Process the Thief's night action (night 1 only).
 *
 * The Thief steals the target's role and alignment; the target becomes a
 * plain Villager. Both players are DM'd the result.
 */
export async function processThiefActions(
  gameId: string,
  players: GamePlayerState[],
  actions: NightActionRow[],
): Promise<{ thiefActed: boolean }> {
  const thief = players.find((p) => p.is_alive && p.role === 'thief');
  if (!thief) return { thiefActed: false };

  const action = actions.find(
    (a) => a.actor_id === thief.user_id && a.action_kind === 'steal',
  );
  if (!action || !action.target_id) return { thiefActed: false };

  const target = players.find((p) => p.user_id === action.target_id);
  if (!target) return { thiefActed: false };

  const stolenRole = target.role as RoleName;
  const stolenAlignment = (target.alignment ?? 'town') as Alignment;

  await setPlayerRoleAndAlignment(gameId, thief.user_id, stolenRole, stolenAlignment);
  await setPlayerRoleAndAlignment(gameId, target.user_id, 'villager', 'town');

  await safeDm(thief.user_id, thiefNewRoleDmLine(target.user_id, stolenRole), 'thief new role');
  await safeDm(target.user_id, thiefTargetDmLine(), 'thief target');

  return { thiefActed: true };
}
