import {
  InteractionResponseFlags,
  MessageComponentTypes,
} from 'discord-interactions';
import type { AssignedRole } from '../types.js';
import type { GameRow } from '../../db/games.js';
import type { GamePlayerState } from '../../db/players.js';
import { ROLE_REGISTRY, isRoleName } from '../balancing/roleRegistry.js';
import { DiscordRequest, openDmChannel, postChannelMessage } from '../../utils.js';
import { recordNightActionPrompt } from '../../db/nightActions.js';

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
        user: { username: string };
        global_name: string
      };
      return member.global_name ?? member.nick ?? member.user.username;
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

async function getDisplayName(userId: string, guildId: string | null): Promise<string> {
  const existing = displayNameCache.get(userId);
  if (existing) return existing;

  const promise = fetchDisplayName(userId, guildId);
  displayNameCache.set(userId, promise);
  return promise;
}

export async function dmRolesAndNightActions(params: {
  game: GameRow;
  playerIds: string[];
  assignments: AssignedRole[];
  nightNumber: number;
}): Promise<void> {
  const { game, playerIds, assignments, nightNumber } = params;

  for (const assignment of assignments) {
    try {
      const dmChannelId = await openDmChannel(assignment.userId);

      const def = ROLE_REGISTRY[assignment.role];
      const roleLine = def.dmIntro;

      const baseContent = `Your role for this Werewolf game is: **${assignment.role}**.\n${roleLine}`;

      const components: any[] = [];

      const hasNightAction =
        def.nightAction.target === 'player' && def.nightAction.kind !== 'none';

      if (hasNightAction) {
        const options = [];
        for (const id of playerIds) {
          if (!def.nightAction.canTargetSelf && id === assignment.userId) continue;
          const label = await getDisplayName(id, game.guild_id);
          options.push({ label, value: id });
        }

        if (options.length > 0) {
          components.push({
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
          });
        }
      }

      if (components.length && hasNightAction) {
        const msgRes = await postChannelMessage(dmChannelId, {
          // With IS_COMPONENTS_V2, text must be inside TEXT_DISPLAY,
          // not the legacy `content` field.
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              content: baseContent,
            },
            ...components,
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
      } else {
        await postChannelMessage(dmChannelId, {
          // No components v2 here, so plain content is fine.
          content: baseContent,
        });
      }
    } catch (err) {
      console.error('Failed to DM role to user', assignment.userId, err);
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

  const assignments: AssignedRole[] = alivePlayers
    .map((p) => {
      if (!isRoleName(p.role)) return null;
      const def = ROLE_REGISTRY[p.role];
      if (def.nightAction.kind === 'none') {
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

  const nightNumber = game.current_night || 1;
  await dmRolesAndNightActions({ game, playerIds: targetIds, assignments, nightNumber });
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

      await postChannelMessage(dmChannelId, {
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
    } catch (err) {
      console.error('Failed to DM day vote prompt to user', player.user_id, err);
    }
  }
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
