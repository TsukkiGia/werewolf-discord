import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKeyMiddleware,
  ButtonStyleTypes,
  MessageComponentTypes,
} from 'discord-interactions';
import {
  initDb,
  createGame,
  addPlayer,
  getGame,
  getActiveGameForChannel,
  getPlayerIdsForGame,
  endGame,
  startGame,
} from './db.js';
import { assignRolesForGame } from './db/players.js';
import { DiscordRequest } from './utils.js';
import { ROLE_REGISTRY } from './game/balancing/roleRegistry.js';
import { recordNightAction } from './db/nightActions.js';

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

// Ensure database schema exists before handling traffic
await initDb();

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT: number = Number(process.env.PORT) || 3000;

/**
 * Interactions endpoint URL where Discord will send HTTP requests.
 * Parses request body and verifies incoming requests using discord-interactions.
 */
app.post(
  '/interactions',
  verifyKeyMiddleware(process.env.PUBLIC_KEY as string),
  async (req: any, res: any) => {
    // Interaction type and data
    const { type, id, data } = req.body;

    /**
     * Handle verification requests
     */
    if (type === InteractionType.PING) {
      return res.send({ type: InteractionResponseType.PONG });
    }

    /**
     * Handle slash command requests
     * (Specific command behavior will be filled in later.)
     */
    if (type === InteractionType.APPLICATION_COMMAND) {
      const { name } = data;

	      if (name === 'ww_create' && id) {
	        const context = req.body.context;
	        // User ID is in user field for (G)DMs, and member for servers
	        const userId =
	          context === 0
	            ? req.body.member.user.id
	            : (req.body.user?.id ?? req.body.member?.user?.id);

	        const gameId = String(id);
	        const guildId: string | null = req.body.guild_id ?? null;
	        const channelId: string | null = req.body.channel?.id ?? null;

	        // Enforce only one active game per channel
	        const existingGame = await getActiveGameForChannel(guildId, channelId);
	        if (existingGame) {
	          return res.send({
	            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
	            data: {
	              content: `There is already an active Werewolf game in this channel started by <@${existingGame.host_id}>.`,
	            },
	          });
	        }

	        // Persist game and host player in the database
	        await createGame({
	          id: gameId,
	          guildId,
	          channelId,
	          hostId: userId,
	        });
	        await addPlayer(gameId, userId);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: `Game started by <@${userId}>`,
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                      {
                        type: MessageComponentTypes.BUTTON,
                        // Append the game ID to use later on
                        custom_id: `join_button_${gameId}`,
                        label: 'Join',
                        style: ButtonStyleTypes.PRIMARY,
                      },
                ],
              },
            ],
          },
        });
      }

      if (name === 'ww_end') {
        const guildId: string | null = req.body.guild_id ?? null;
        const channelId: string | null = req.body.channel?.id ?? null;

        const game = await getActiveGameForChannel(guildId, channelId);

        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'There is no active Werewolf game in this channel to end.',
            },
          });
        }

        const context = req.body.context;
        const userId =
          context === 0
            ? req.body.member.user.id
            : (req.body.user?.id ?? req.body.member?.user?.id);

        if (userId !== game.host_id) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Only the host <@${game.host_id}> can end this game.`,
            },
          });
        }

        await endGame(game.id);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `The Werewolf game in this channel has been ended by <@${userId}>.`,
          },
        });
      }

      if (name === 'ww_help') {
        // TODO: implement help
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Help command not implemented yet.',
          },
        });
      }

      if (name === 'ww_status') {
        const guildId: string | null = req.body.guild_id ?? null;
        const channelId: string | null = req.body.channel?.id ?? null;

        const game = await getActiveGameForChannel(guildId, channelId);

        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'There is no active Werewolf game in this channel.',
            },
          });
        }

        const playerIds = await getPlayerIdsForGame(game.id);
        const playersText =
          playerIds.length > 0
            ? playerIds.map((id: string) => `<@${id}>`).join('\n')
            : 'No players have joined yet.';

        const messageLines = [
          `Game status for this channel:`,
          `Phase: ${game.status}`,
          `Host: <@${game.host_id}>`,
          `Players (${playerIds.length}):`,
          playersText,
        ];

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: messageLines.join('\n'),
          },
        });
      }

      if (name === 'ww_start') {
        const guildId: string | null = req.body.guild_id ?? null;
        const channelId: string | null = req.body.channel?.id ?? null;

        const game = await getActiveGameForChannel(guildId, channelId);

        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'There is no active Werewolf game in this channel to start.',
            },
          });
        }

        const context = req.body.context;
        const userId =
          context === 0
            ? req.body.member.user.id
            : (req.body.user?.id ?? req.body.member?.user?.id);

        if (userId !== game.host_id) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Only the host <@${game.host_id}> can start this game.`,
            },
          });
        }

        const playerIds = await getPlayerIdsForGame(game.id);
        if (playerIds.length < 2) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'You need at least 3 players to start a Werewolf game.',
            },
          });
        }

        const assignments = await assignRolesForGame(game.id);

        await startGame(game.id);

        // DM each player their role and night action (if any)
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

        const playersText =
          playerIds.length > 0
            ? playerIds.map((id: string) => `<@${id}>`).join(', ')
            : 'No players (this should not happen).';

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `The Werewolf game has started!\nHost: <@${game.host_id}>\nPlayers: ${playersText}`,
          },
        });
      }

      console.error(`unknown command: ${name}`);
      return res.status(400).json({ error: 'unknown command' });
    }

    /**
     * Handle requests from interactive components
     * (Specific UI and game behavior will be filled in later.)
     */
	      if (type === InteractionType.MESSAGE_COMPONENT) {
	        // custom_id set in payload when sending message component
	        const componentId: string = data.custom_id;

	        if (componentId.startsWith('join_button_')) {
	          // get the associated game ID
	          const gameId = componentId.replace('join_button_', '');
	          const game = await getGame(gameId);

	          if (!game) {
	            return res.send({
	              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
	              data: {
	                flags:
	                  InteractionResponseFlags.IS_COMPONENTS_V2,
	                components: [
	                  {
	                    type: MessageComponentTypes.TEXT_DISPLAY,
	                    content: 'This game no longer exists.',
	                  },
	                ],
	              },
	            });
	          }

	          const context = req.body.context;
	          const userId =
	            context === 0
	              ? req.body.member.user.id
	              : (req.body.user?.id ?? req.body.member?.user?.id);
	          await addPlayer(gameId, userId);
	          return res.send({
	            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
	            data: {
	              flags:
	                InteractionResponseFlags.IS_COMPONENTS_V2,
	              components: [
	                {
	                  type: MessageComponentTypes.TEXT_DISPLAY,
	                  content: `<@${userId}> joined the game.`,
	                },
	              ],
	            },
	          });
	        } else if (componentId.startsWith('night_action:')) {
	          const withoutPrefix = componentId.replace('night_action:', '');
	          const [gameId, role] = withoutPrefix.split(':');

	          const targetId: string | null =
	            Array.isArray(data.values) && data.values.length > 0 ? data.values[0] : null;

	          const actorId =
	            req.body.member?.user?.id ?? req.body.user?.id;

	          if (!actorId || !gameId || !role) {
	            return res.status(400).json({ error: 'invalid night action payload' });
	          }

	          const def = ROLE_REGISTRY[role as keyof typeof ROLE_REGISTRY];

	          await recordNightAction({
	            gameId,
	            night: 1,
	            actorId,
	            targetId,
	            actionKind: def.nightAction.kind,
	            role: def.name,
	          });

	          return res.send({
	            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
	            data: {
	              flags: InteractionResponseFlags.EPHEMERAL,
	              content: 'Your night action has been recorded.',
	            },
	          });
	        }

        console.error(`unknown component: ${componentId}`);
        return res.status(400).json({ error: 'unknown component' });
      }

    console.error('unknown interaction type', type);
    return res.status(400).json({ error: 'unknown interaction type' });
  },
);

// Simple health check / welcome route
app.get('/', (_req, res) => {
  res.send('Werewolf Discord bot server is running.');
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});

export default app;
