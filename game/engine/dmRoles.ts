import {
  InteractionResponseFlags,
  MessageComponentTypes,
} from 'discord-interactions';
import type { AssignedRole } from '../types.js';
import type { GameRow } from '../../db/games.js';
import type { GamePlayerState } from '../../db/players.js';
import { ROLE_REGISTRY, isRoleName } from '../balancing/roleRegistry.js';
import { DiscordRequest, openDmChannel, postChannelMessage, patchChannelMessage } from '../../utils.js';
import { recordNightActionPrompt } from '../../db/nightActions.js';
import { getDousedTargets } from '../../db/arsonist.js';
import { recordDayVotePrompt, getDayVotePrompts } from '../../db/dayVotePrompts.js';
import { logEvent } from '../../logging.js';

// Cache display names per user ID for the lifetime of the process so we don't
// spam the Discord API (and hit rate limits) when building option lists.
const displayNameCache = new Map<string, Promise<string>>();

async function fetchDisplayName(userId: string, guildId: string | null): Promise<string> {
  // Prefer guild nickname/username when we know the guild
  if (guildId) {
    try {
      const res = await DiscordRequest(`guilds/${guildId}/members/${userId}`, {
        method: 'GET',
      });
      const member = (await res.json()) as {
        nick: string | null;
        user: { username: string; global_name: string | null };
      };
      // Prefer server nickname, then global display name, then username.
      return member.nick ?? member.user.global_name ?? member.user.username;
    } catch (err) {
      console.error('Failed to fetch guild member', guildId, userId, err);
    }
  }

  // Fallback to global username
  try {
    const res = await DiscordRequest(`users/${userId}`, { method: 'GET' });
    const user = (await res.json()) as { username: string , global_name: string};
    return user.global_name ?? user.username;
  } catch (err) {
    console.error('Failed to fetch user', userId, err);
  }

  // Last resort: show raw ID
  return userId;
}

export async function getDisplayName(userId: string, guildId: string | null): Promise<string> {
  const cacheKey = `${userId}:${guildId ?? ''}`;
  const existing = displayNameCache.get(cacheKey);
  if (existing) return existing;

  const promise = fetchDisplayName(userId, guildId);
  displayNameCache.set(cacheKey, promise);
  return promise;
}

async function dmNightPromptsCore(params: {
  game: GameRow;
  playerIds: string[];
  assignments: AssignedRole[];
  nightNumber: number;
}): Promise<void> {
  const { game, playerIds, assignments, nightNumber } = params;

  const dousedTargets =
    assignments.some((a) => a.role === 'arsonist') && game.id
      ? await getDousedTargets(game.id)
      : [];

  for (const assignment of assignments) {
    try {
      const def = ROLE_REGISTRY[assignment.role];

      // Skip entirely if this role has no player-targeted night action.
      if (def.nightAction.target !== 'player' || def.nightAction.kind === 'none') {
        continue;
      }

      // Cupid uses a custom two-step flow and custom component IDs.
      if (def.name === 'cupid') {
        if (nightNumber !== 1) {
          continue;
        }

        const options = [];
        for (const id of playerIds) {
          if (id === assignment.userId) continue;
          const label = await getDisplayName(id, game.guild_id);
          options.push({ label, value: id });
        }

        if (options.length === 0) continue;

        const dmChannelId = await openDmChannel(assignment.userId);

        const msgRes = await postChannelMessage(dmChannelId, {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              content:
                'Night 1: choose the first of two players to link as Lovers. You cannot choose yourself.',
            },
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.STRING_SELECT,
                  custom_id: `cupid_link1:${game.id}`,
                  placeholder: 'Choose the first Lover',
                  min_values: 1,
                  max_values: 1,
                  options,
                },
              ],
            },
          ],
        });

        const msg = (await msgRes.json()) as { id?: string };
        if (msg.id) {
          await recordNightActionPrompt({
            gameId: game.id,
            night: nightNumber,
            userId: assignment.userId,
            channelId: dmChannelId,
            messageId: msg.id,
          });
        }

        continue;
      }

      let baseContent = def.nightAction.prompt
        ? def.nightAction.prompt.replace('{night}', String(nightNumber))
        : `Night ${nightNumber}: choose your night target.`;

      if (def.name === 'arsonist' && dousedTargets.length > 0) {
        const dousedLabels = await Promise.all(
          dousedTargets.map((id) => getDisplayName(id, game.guild_id)),
        );
        baseContent += `\nAlready doused: ${dousedLabels.join(', ')}`;
      }

      const options = [];
      for (const id of playerIds) {
        if (!def.nightAction.canTargetSelf && id === assignment.userId) continue;
        // Arsonist can only see undoused houses as douse targets.
        if (def.name === 'arsonist' && dousedTargets.includes(id)) continue;
        const label = await getDisplayName(id, game.guild_id);
        options.push({ label, value: id });
      }

      if (def.name === 'arsonist' && dousedTargets.length > 0) {
        options.unshift({
          label: '🔥 Ignite all doused houses',
          value: '__ARSONIST_IGNITE__',
        });
      }

      if (options.length === 0) continue;

      const dmChannelId = await openDmChannel(assignment.userId);

      const msgRes = await postChannelMessage(dmChannelId, {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: baseContent,
          },
          {
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              {
                type: MessageComponentTypes.STRING_SELECT,
                custom_id: `night_action:${game.id}:${assignment.role}`,
                placeholder: 'Choose your night target',
                min_values: 1,
                max_values: 1,
                options,
              },
            ],
          },
        ],
      });

      const msg = (await msgRes.json()) as { id?: string };
      if (msg.id) {
        await recordNightActionPrompt({
          gameId: game.id,
          night: nightNumber,
          userId: assignment.userId,
          channelId: dmChannelId,
          messageId: msg.id,
        });
      }
    } catch (err) {
      console.error('Failed to DM role to user', assignment.userId, err);
    }
  }
}

/**
 * DM each player's role intro once at the start of the game.
 * This does not include any night-action components; those are
 * handled separately by dmNightActionsForAlivePlayers.
 */
export function buildRoleIntroForAssignment(
  assignment: AssignedRole,
  allAssignments: AssignedRole[],
): string {
  const def = ROLE_REGISTRY[assignment.role];

  return def.buildRoleIntro({ assignment, allAssignments });
}

export async function dmRolesForAssignments(params: {
  game: GameRow;
  assignments: AssignedRole[];
}): Promise<void> {
  const { game, assignments } = params;

  for (const assignment of assignments) {
    try {
      const dmChannelId = await openDmChannel(assignment.userId);
      const baseContent = buildRoleIntroForAssignment(assignment, assignments);

      await postChannelMessage(dmChannelId, {
        content: baseContent,
      });
    } catch (err) {
      console.error('Failed to DM role to user', assignment.userId, err);
    }
  }

  // Debug: DM the developer a summary of role assignments to sanity-check shuffling.
  // This is hard-coded to Gianna's Discord user ID and can be removed or gated
  // once the shuffling logic is trusted.
  const debugUserId = '770372516849516624';
  if (debugUserId && assignments.length > 0) {
    try {
      const dmChannelId = await openDmChannel(debugUserId);
      const lines = assignments.map((a) => {
        const def = ROLE_REGISTRY[a.role];
        return `<@${a.userId}> → **${a.role}** (${def.alignment})`;
      });
      const content = [
        `Debug: role assignments for game ${game.id}:`,
        ...lines,
      ].join('\n');
      await postChannelMessage(dmChannelId, { content });
    } catch (err) {
      console.error('Failed to DM debug role assignments', err);
    }
  }
}

/**
 * DM night-action prompts to all alive players who actually have
 * a night action (werewolves, seer, doctor, etc.) using the current
 * game state from the database.
 */
export async function dmNightActionsForAlivePlayers(params: {
  game: GameRow;
  players: GamePlayerState[];
}): Promise<void> {
  const { game, players } = params;

  const alivePlayers = players.filter((p) => p.is_alive);
  if (alivePlayers.length === 0) return;

  const targetIds = alivePlayers.map((p) => p.user_id);
  const nightNumber = game.current_night || 1;

  const assignments: AssignedRole[] = alivePlayers
    .map((p) => {
      if (!isRoleName(p.role)) return null;
      const def = ROLE_REGISTRY[p.role];
      if (def.nightAction.kind === 'none') {
        return null;
      }
      if (def.isNightActionRequired && !def.isNightActionRequired({ nightNumber })) {
        return null;
      }
      return {
        userId: p.user_id,
        role: def.name,
        alignment: def.alignment,
      };
    })
    .filter((a): a is AssignedRole => a !== null);

  if (assignments.length === 0) return;

  await dmNightPromptsCore({
    game,
    playerIds: targetIds,
    assignments,
    nightNumber,
  });
}

export async function dmDayVotePrompts(params: {
  game: GameRow;
  players: GamePlayerState[];
}): Promise<void> {
  const { game, players } = params;

  const alivePlayers = players.filter((p) => p.is_alive);
  const aliveIds = alivePlayers.map((p) => p.user_id);

  for (const player of alivePlayers) {
    try {
      logEvent('day_vote_dm_send', {
        gameId: game.id,
        day: game.current_day ?? null,
        userId: player.user_id,
      });
      const dmChannelId = await openDmChannel(player.user_id);

      const options = [];
      for (const id of aliveIds) {
        // Typically you can't vote if you're dead; here only alive players are listed.
        // We also exclude self from the target list to avoid accidental self-votes.
        if (id === player.user_id) continue;
        const label = await getDisplayName(id, game.guild_id);
        options.push({ label, value: id });
      }

      if (options.length === 0) {
        continue;
      }

      const msgRes = await postChannelMessage(dmChannelId, {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content:
              'It is day. Choose a player to lynch from the list below.',
          },
          {
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              {
                type: MessageComponentTypes.STRING_SELECT,
                custom_id: `day_vote:${game.id}`,
                placeholder: 'Choose a player to lynch',
                min_values: 1,
                max_values: 1,
                options,
              },
            ],
          },
        ],
      });

      const msg = (await msgRes.json()) as { id?: string };
      if (msg.id && game.current_day) {
        await recordDayVotePrompt({
          gameId: game.id,
          day: game.current_day,
          userId: player.user_id,
          channelId: dmChannelId,
          messageId: msg.id,
        });
      }
    } catch (err) {
      console.error('Failed to DM day vote prompt to user', player.user_id, err);
      logEvent('day_vote_dm_error', {
        gameId: game.id,
        day: game.current_day ?? null,
        userId: player.user_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Edit all day-vote DM messages for the given day to replace the select
 * menu with a "Voting has ended" notice, so stale prompts can't be used.
 */
export async function disableDayVotePrompts(gameId: string, day: number): Promise<void> {
  const prompts = await getDayVotePrompts(gameId, day);
  await Promise.all(
    prompts.map(async (p) => {
      try {
        await patchChannelMessage(p.channel_id, p.message_id, {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              content: 'Voting has ended.',
            },
          ],
        });
      } catch (err) {
        console.error('Failed to disable day vote prompt', p.user_id, err);
      }
    }),
  );
}

export async function startDayVoting(params: {
  game: GameRow;
  players: GamePlayerState[];
  dayNumber: number;
}): Promise<void> {
  const { game, players, dayNumber } = params;

  await dmDayVotePrompts({ game, players });

  if (!game.channel_id) {
    return;
  }

  try {
    await postChannelMessage(game.channel_id, {
      content: `Voting for Day ${dayNumber} begins now. Check your DMs to cast your vote.`,
    });
  } catch (err) {
    console.error('Failed to send day voting start message', err);
  }
}
