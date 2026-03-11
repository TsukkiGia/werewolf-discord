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
  killedDoctorIds: string[];
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
  channelId: string | null,
): Promise<DoctorActionResult> {
  const protectActions = actions.filter(
    (a) => a.action_kind === 'protect' && a.target_id,
  );

  let anySaved = false;
  const killedDoctorIds: string[] = [];

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
          killedDoctorIds.push(doctorId);
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
        if (doctorDies && channelId) {
          try {
            await postChannelMessage(channelId, {
              content: `<@${doctorId}> tried to shield a wolf in disguise and was killed for it.`,
            });
          } catch (err) {
            console.error('Failed to send doctor wolf-death channel message', err);
          }
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

  return { anySaved, killedDoctorIds };
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
export async function processHarlotActions(
  players: GamePlayerState[],
  visitActions: HarlotVisit[],
  wolfChosenVictimId: string | null,
  gameId: string,
  channelId: string | null,
): Promise<{ killedHarlotIds: string[] }> {
  const killedHarlotIds: string[] = [];

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
        dmContent = harlotVisitedWolfLine(targetId);
        if (channelId) {
          try {
            await postChannelMessage(channelId, {
              content: `<@${harlotId}> slipped into the wrong bed last night — a wolf was waiting. They never saw the dawn.`,
            });
          } catch (err) {
            console.error('Failed to send harlot wolf-death channel message', err);
          }
        }
      } else if (visitedWolfTarget) {
        await markPlayerDead(gameId, harlotId);
        killedHarlotIds.push(harlotId);
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

  return { killedHarlotIds };
}
