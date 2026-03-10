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
import { initDb, createGame, addPlayer, getGame } from './db.js';

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
	        const userId = context === 0 ? req.body.member.user.id : req.body.user.id;

	        const gameId = String(id);
	        const guildId: string | null = req.body.guild_id ?? null;
	        const channelId: string | null = req.body.channel?.id ?? null;

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
        // TODO: implement end
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'End command not implemented yet.',
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
	                  InteractionResponseFlags.IS_COMPONENTS_V2 | InteractionResponseFlags.EPHEMERAL,
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
	          const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
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
