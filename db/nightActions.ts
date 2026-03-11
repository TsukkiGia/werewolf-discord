import { pool } from './client.js';
import type { NightActionKind, RoleName } from '../game/types.js';
import { WOLF_PACK_ROLES } from '../game/types.js';
import type { GamePlayerState } from './players.js';
import { markPlayerDead } from './players.js';
import { openDmChannel, postChannelMessage } from '../utils.js';

export interface NightActionRow {
  id: number;
  game_id: string;
  night: number;
  actor_id: string;
  target_id: string | null;
  action_kind: NightActionKind;
  role: RoleName;
  created_at: number;
}

export interface NightActionPromptRow {
  game_id: string;
  night: number;
  user_id: string;
  channel_id: string;
  message_id: string;
}

export async function recordNightAction(params: {
  gameId: string;
  night: number;
  actorId: string;
  targetId: string | null;
  actionKind: NightActionKind;
  role: RoleName;
}): Promise<boolean> {
  const createdAt = Date.now();
  const result = await pool.query(
    `
    INSERT INTO night_actions (game_id, night, actor_id, target_id, action_kind, role, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (game_id, night, actor_id) DO NOTHING
    `,
    [
      params.gameId,
      params.night,
      params.actorId,
      params.targetId,
      params.actionKind,
      params.role,
      createdAt,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function hasNightAction(
  gameId: string,
  night: number,
  actorId: string,
): Promise<boolean> {
  const result = await pool.query(
    `
    SELECT 1
    FROM night_actions
    WHERE game_id = $1 AND night = $2 AND actor_id = $3
    LIMIT 1
    `,
    [gameId, night, actorId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function getNightActionsForNight(
  gameId: string,
  night: number,
): Promise<NightActionRow[]> {
  const result = await pool.query<NightActionRow>(
    `
    SELECT id, game_id, night, actor_id, target_id, action_kind, role, created_at
    FROM night_actions
    WHERE game_id = $1 AND night = $2
    ORDER BY created_at ASC
    `,
    [gameId, night],
  );

  return result.rows;
}

export async function recordNightActionPrompt(params: {
  gameId: string;
  night: number;
  userId: string;
  channelId: string;
  messageId: string;
}): Promise<void> {
  await pool.query(
    `
    INSERT INTO night_action_prompts (game_id, night, user_id, channel_id, message_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (game_id, night, user_id)
    DO UPDATE SET channel_id = EXCLUDED.channel_id,
                  message_id = EXCLUDED.message_id
    `,
    [params.gameId, params.night, params.userId, params.channelId, params.messageId],
  );
}

export async function getNightActionPromptsForNight(
  gameId: string,
  night: number,
): Promise<NightActionPromptRow[]> {
  const result = await pool.query<NightActionPromptRow>(
    `
    SELECT game_id, night, user_id, channel_id, message_id
    FROM night_action_prompts
    WHERE game_id = $1 AND night = $2
    `,
    [gameId, night],
  );

  return result.rows;
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
        await postChannelMessage(dmChannelId, {
          content,
        });
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
 *   retaliation. The doctor is DM'd either way.
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
        const doctorDies = Math.random() < 0.5;
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

      const content = saved
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
