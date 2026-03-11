import type { NightActionRow } from '../../db/nightActions.js';
import type { GamePlayerState } from '../../db/players.js';
import { markPlayerDead } from '../../db/players.js';
import { WOLF_PACK_ROLES, type RoleName } from '../types.js';
import { openDmChannel, postChannelMessage } from '../../utils.js';

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
      if (WOLF_PACK_ROLES.has(target.role as RoleName)) {
        const doctorDies = Math.random() < 0.75;
        if (doctorDies) {
          await markPlayerDead(action.game_id, doctorId);
          killedDoctorIds.push(doctorId);
        }
        const dmContent = doctorDies
          ? `You tried to protect <@${targetId}>, who turned out to be a wolf. They attacked you in return — you have been eliminated.`
          : `You tried to protect <@${targetId}>, who turned out to be a wolf. You narrowly escaped with your life.`;
        try {
          const dmChannelId = await openDmChannel(doctorId);
          await postChannelMessage(dmChannelId, { content: dmContent });
        } catch (err) {
          console.error('Failed to DM doctor wolf-protection result', err);
        }
        if (doctorDies && channelId) {
          try {
            await postChannelMessage(channelId, {
              content: `<@${doctorId}> went to protect a wolf and paid with their life.`,
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
          ? 'You protected yourself. The wolves came for you tonight, but you survived.'
          : 'You protected yourself. The wolves left you alone tonight.'
        : saved
          ? `You protected <@${targetId}>. The wolves attacked them tonight, but you saved their life.`
          : `You protected <@${targetId}>. Nothing happened to them tonight.`;

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
