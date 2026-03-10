import {
  InteractionResponseFlags,
  MessageComponentTypes,
} from 'discord-interactions';
import type { AssignedRole } from '../types.js';
import type { GameRow } from '../../db/games.js';
import type { GamePlayerState } from '../../db/players.js';
import { ROLE_REGISTRY } from '../balancing/roleRegistry.js';
import { DiscordRequest } from '../../utils.js';

async function getDisplayName(userId: string, guildId: string | null): Promise<string> {
  // Prefer guild nickname/username when we know the guild
  if (guildId) {
    try {
      const res = await DiscordRequest(`guilds/${guildId}/members/${userId}`, {
        method: 'GET',
      });
      const member = (await res.json()) as {
        nick: string | null;
        user: { username: string };
      };
      return member.nick ?? member.user.username;
    } catch (err) {
      console.error('Failed to fetch guild member', guildId, userId, err);
    }
  }

  // Fallback to global username
  try {
    const res = await DiscordRequest(`users/${userId}`, { method: 'GET' });
    const user = (await res.json()) as { username: string };
    return user.username;
  } catch (err) {
    console.error('Failed to fetch user', userId, err);
  }

  // Last resort: show raw ID
  return userId;
}

export async function dmRolesAndNightActions(params: {
  game: GameRow;
  playerIds: string[];
  assignments: AssignedRole[];
}): Promise<void> {
  const { game, playerIds, assignments } = params;

  await Promise.all(
    assignments.map(async (assignment) => {
      try {
        const dmRes = await DiscordRequest('users/@me/channels', {
          method: 'POST',
          body: { recipient_id: assignment.userId },
        });
        const dmChannel = (await dmRes.json()) as { id: string };

        const def = ROLE_REGISTRY[assignment.role];
        const roleLine = def.dmIntro;

        const baseContent = `Your role for this Werewolf game is: **${assignment.role}**.\n${roleLine}`;

        const components: any[] = [];

        if (def.nightAction.target === 'player' && def.nightAction.kind !== 'none') {
          const options = await Promise.all(
            playerIds
              .filter((id: string) =>
                def.nightAction.canTargetSelf ? true : id !== assignment.userId,
              )
              .map(async (id: string) => ({
                label: await getDisplayName(id, game.guild_id),
                value: id,
              })),
          );

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

        await DiscordRequest(`channels/${dmChannel.id}/messages`, {
          method: 'POST',
          body: components.length
            ? {
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
              }
            : {
                // No components v2 here, so plain content is fine.
                content: baseContent,
              },
        });
      } catch (err) {
        console.error('Failed to DM role to user', assignment.userId, err);
      }
    }),
  );
}

export async function dmDayVotePrompts(params: {
  game: GameRow;
  players: GamePlayerState[];
}): Promise<void> {
  const { game, players } = params;

  const alivePlayers = players.filter((p) => p.is_alive);
  const aliveIds = alivePlayers.map((p) => p.user_id);

  await Promise.all(
    alivePlayers.map(async (player) => {
      try {
        const dmRes = await DiscordRequest('users/@me/channels', {
          method: 'POST',
          body: { recipient_id: player.user_id },
        });
        const dmChannel = (await dmRes.json()) as { id: string };

        const options = await Promise.all(
          aliveIds
            // Typically you can't vote if you're dead; here only alive players are listed.
            // We also exclude self from the target list to avoid accidental self-votes.
            .filter((id) => id !== player.user_id)
            .map(async (id) => ({
              label: await getDisplayName(id, game.guild_id),
              value: id,
            })),
        );

        if (options.length === 0) {
          return;
        }

        await DiscordRequest(`channels/${dmChannel.id}/messages`, {
          method: 'POST',
          body: {
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
          },
        });
      } catch (err) {
        console.error('Failed to DM day vote prompt to user', player.user_id, err);
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
    await DiscordRequest(`channels/${game.channel_id}/messages`, {
      method: 'POST',
      body: {
        content: `Voting for Day ${dayNumber} begins now. Check your DMs to cast your vote.`,
      },
    });
  } catch (err) {
    console.error('Failed to send day voting start message', err);
  }
}

