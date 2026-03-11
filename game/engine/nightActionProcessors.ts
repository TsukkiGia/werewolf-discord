import type { NightActionRow } from '../../db/nightActions.js';
import type { GamePlayerState } from '../../db/players.js';
import { markPlayerDead } from '../../db/players.js';
import { WOLF_PACK_ROLES, type RoleName } from '../types.js';
import type { HarlotVisit } from './nightResolution.js';
import { openDmChannel, postChannelMessage } from '../../utils.js';
import { harlotVisitedWolfLine, harlotVisitedTargetLine, harlotSafeVisitLine, harlotVisitNotificationLine } from '../strings/narration.js';

/**
 * Process all seer-type night actions by DMing inspection results.
 * Players is the pre-kill snapshot so seers always receive their result,
 * even if their target is killed later the same night.
 */
export async function processSeerActions(
  players: GamePlayerState[],
  actions: NightActionRow[],
): Promise<void> {
  const inspectActions = actions.filter(
    (a) => a.action_kind === 'inspect' && a.target_id,
  );

  await Promise.all(
    inspectActions.map(async (action) => {
      const target = players.find((p) => p.user_id === action.target_id);
      if (!target) return;

      const isWolf = target.alignment === 'wolf';
      const isSeer = target.role === 'seer';

      let content: string;
      if (action.role === 'sorcerer') {
        if (isWolf) {
          content = `Your vision reveals that <@${target.user_id}> is aligned with the **wolves**.`;
        } else if (isSeer) {
          content = `Your vision reveals that <@${target.user_id}> is the **Seer**.`;
        } else {
          content = `Your vision reveals that <@${target.user_id}> is neither a wolf nor the Seer.`;
        }
      } else {
        // Default seer-like behavior: reveal exact role.
        content = `Your vision reveals that <@${target.user_id}> is **${target.role}**.`;
      }

      try {
        const dmChannelId = await openDmChannel(action.actor_id);
        await postChannelMessage(dmChannelId, { content });
      } catch (err) {
        console.error('Failed to DM seer inspection result', err);
      }
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
 * - If the doctor targeted a non-wolf who was attacked and survived: saved.
 * - If the doctor targeted a non-wolf who wasn't attacked: quiet night.
 * - Future: if the target was absent (e.g. harlot left home), the doctor
 *   should be told the target wasn't home. Pass an `absentIds` set here
 *   when that mechanic is implemented.
 */
export async function processDoctorActions(
  players: GamePlayerState[],
  actions: NightActionRow[],
  killTargets: string[],
  killedIds: string[],
): Promise<DoctorActionResult> {
  const protectActions = actions.filter(
    (a) => a.action_kind === 'protect' && a.target_id,
  );

  let anySaved = false;
  let killedDoctorId: string | null = null;
  let doctorDeathInfo: { doctorId: string; wolfTargetId: string } | null = null;

  await Promise.all(
    protectActions.map(async (action) => {
      const target = players.find((p) => p.user_id === action.target_id);
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
        const dmContent = doctorDies
          ? `You tried to protect <@${targetId}>, but they were a wolf in disguise. They turned on you — you did not survive.`
          : `You tried to protect <@${targetId}>, but they were a wolf in disguise. They lunged for you, but you escaped with your life.`;
        try {
          const dmChannelId = await openDmChannel(doctorId);
          await postChannelMessage(dmChannelId, { content: dmContent });
        } catch (err) {
          console.error('Failed to DM doctor wolf-protection result', err);
        }
        return;
      }

      // Standard protection — target is not a wolf.
      const saved = killTargets.includes(targetId) && !killedIds.includes(targetId);

      if (saved) anySaved = true;

      const isSelf = targetId === doctorId;
      const content = isSelf
        ? saved
          ? 'You guarded yourself tonight. The wolves came for you, but your defenses held.'
          : 'You guarded yourself tonight. The wolves never came.'
        : saved
          ? `You watched over <@${targetId}>. The wolves struck, but your protection held.`
          : `You watched over <@${targetId}>. The night passed quietly.`;

      try {
        const dmChannelId = await openDmChannel(doctorId);
        await postChannelMessage(dmChannelId, { content });
      } catch (err) {
        console.error('Failed to DM doctor protection result', err);
      }
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
  wolfChosenVictimId: string | null,
  gameId: string,
): Promise<HarlotActionResult> {
  const killedHarlotIds: string[] = [];
  const harlotDeathInfos: { harlotId: string; targetId: string; cause: 'visited_wolf' | 'visited_victim' }[] = [];

  await Promise.all(
    visitActions.map(async (visit) => {
      const { harlotId, targetId } = visit;
      const target = players.find((p) => p.user_id === targetId);
      if (!target) return;

      const visitedWolf = WOLF_PACK_ROLES.has(target.role as RoleName);
      const visitedWolfTarget = targetId === wolfChosenVictimId;

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

      try {
        const dmChannelId = await openDmChannel(harlotId);
        await postChannelMessage(dmChannelId, { content: dmContent });
      } catch (err) {
        console.error('Failed to DM harlot visit result', err);
      }

      // Notify the visited player (only on safe visits — dead players don't get DMs)
      if (!visitedWolf && !visitedWolfTarget) {
        try {
          const targetDmChannelId = await openDmChannel(targetId);
          await postChannelMessage(targetDmChannelId, { content: harlotVisitNotificationLine() });
        } catch (err) {
          console.error('Failed to DM harlot visit notification to target', err);
        }
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
 * - They choose a target player.
 * - One of the two (Chemist or target) dies with 50% probability.
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

    const target = players.find((p) => p.user_id === action.target_id);
    if (!target || !target.is_alive) continue;

    const chemistId = chemist.user_id;
    const targetId = target.user_id;

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

    try {
      const chemistDm = await openDmChannel(chemistId);
      await postChannelMessage(chemistDm, { content: chemistContent });
    } catch (err) {
      console.error('Failed to DM chemist potion result', err);
    }

    try {
      const targetDm = await openDmChannel(targetId);
      await postChannelMessage(targetDm, { content: targetContent });
    } catch (err) {
      console.error('Failed to DM chemist target potion result', err);
    }
  }

  return { killedIds: killedByChemist, duels };
}
