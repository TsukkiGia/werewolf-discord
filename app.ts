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
  assignRolesForGame,
  getPlayersForGame,
  markPlayerDead,
  getNightActionsForNight,
  advancePhase,
  recordNightAction,
  processSeerActions,
  processDoctorActions,
  recordDayVote,
  getVotesForDay,
} from './db.js';
import { DiscordRequest } from './utils.js';
import { ROLE_REGISTRY } from './game/balancing/roleRegistry.js';
import { dmRolesAndNightActions, dmDayVotePrompts } from './game/engine/dmRoles.js';
import { chooseKillVictim } from './game/engine/nightResolution.js';
import { chooseLynchVictim } from './game/engine/dayResolution.js';
import { evaluateWinCondition } from './game/engine/winConditions.js';

async function maybeResolveNight(gameId: string): Promise<void> {
  try {
    const game = await getGame(gameId);
    if (!game || game.status !== 'night') {
      return;
    }

    const nightNumber = 1; // TODO: support multiple nights

    const players = await getPlayersForGame(gameId);

    const requiredActors = players.filter((p) => {
      if (!p.is_alive) return false;
      const def = ROLE_REGISTRY[p.role as keyof typeof ROLE_REGISTRY];
      if (!def) return false;
      return def.nightAction.kind !== 'none';
    });

    const requiredActorIds = new Set(requiredActors.map((p) => p.user_id));

    const actions = await getNightActionsForNight(gameId, nightNumber);
    const actedIds = new Set(actions.map((a) => a.actor_id));

    // Wait until all required night-action roles have acted.
    for (const actorId of requiredActorIds) {
      if (!actedIds.has(actorId)) {
        return;
      }
    }

    // Everyone has acted; resolve night.
    const killTargets = actions
      .filter((a) => a.action_kind === 'kill' && a.target_id)
      .map((a) => a.target_id as string);

    const protectTargets = actions
      .filter((a) => a.action_kind === 'protect' && a.target_id)
      .map((a) => a.target_id as string);

    // Determine final kill victim using engine helper.
    const victimId = chooseKillVictim(killTargets);

    // Send inspection results to seers before applying kills.
    await processSeerActions(players, actions);

    const protectedSet = new Set(protectTargets);

    const killedIds: string[] = [];
    if (victimId && !protectedSet.has(victimId)) {
      killedIds.push(victimId);
      await markPlayerDead(gameId, victimId);
    }

    // Inform doctors whether their protection mattered.
    await processDoctorActions(players, actions, killTargets, killedIds);

    await advancePhase(gameId); // night -> day

    if (game.channel_id) {
      const victims = players.filter((p) => killedIds.includes(p.user_id));
      let summary: string;

      if (victims.length === 0) {
        summary = 'Dawn breaks. No one was eliminated during the night.';
      } else {
        const lines = victims.map(
          (v) => `<@${v.user_id}> was eliminated during the night. They were a **${v.role}**.`,
        );
        summary = `Dawn breaks.\n${lines.join('\n')}`;
      }

      try {
        await DiscordRequest(`channels/${game.channel_id}/messages`, {
          method: 'POST',
          body: { content: summary },
        });
      } catch (err) {
        console.error('Failed to send day summary message', err);
      }
    }

    // After announcing dawn, DM alive players with a day-vote menu.
    try {
      const playersAfterNight = await getPlayersForGame(gameId);
      await dmDayVotePrompts({ game, players: playersAfterNight });
    } catch (err) {
      console.error('Failed to DM day vote prompts', err);
    }
  } catch (err) {
    console.error('Error resolving night phase', err);
  }
}

async function maybeResolveDay(gameId: string): Promise<void> {
  try {
    const game = await getGame(gameId);
    if (!game || game.status !== 'day') {
      return;
    }

    const dayNumber = 1; // TODO: support multiple days

    const players = await getPlayersForGame(gameId);
    const votes = await getVotesForDay(gameId, dayNumber);

    const lynchId = chooseLynchVictim(players, votes);
    if (!lynchId) {
      return; // no majority yet
    }

    const lynched = players.find((p) => p.user_id === lynchId);
    if (!lynched || !lynched.is_alive) {
      return;
    }

    await markPlayerDead(gameId, lynchId);

    // Re-read players after the lynch to evaluate win conditions.
    const updatedPlayers = await getPlayersForGame(gameId);
    const win = evaluateWinCondition(updatedPlayers);

    if (game.channel_id) {
      const lines: string[] = [
        `Day vote results: <@${lynchId}> was lynched. They were a **${lynched.role}**.`,
      ];

      if (win) {
        lines.push(
          win.winner === 'town'
            ? 'Town has eliminated all werewolves. Town wins!'
            : 'Wolves now control the village. Wolves win!',
        );
      } else {
        lines.push('Night falls...');
      }

      try {
        await DiscordRequest(`channels/${game.channel_id}/messages`, {
          method: 'POST',
          body: { content: lines.join('\n') },
        });
      } catch (err) {
        console.error('Failed to send day resolution message', err);
      }
    }

    if (win) {
      await endGame(gameId);
      return;
    }

    // No winner yet: advance to the next phase (day -> night).
    await advancePhase(gameId);
  } catch (err) {
    console.error('Error resolving day phase', err);
  }
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

        // Re-read players to know who is alive; night-action target lists should only
        // include currently-alive players.
        const playersForTargets = await getPlayersForGame(game.id);
        const aliveTargetIds = playersForTargets
          .filter((p) => p.is_alive)
          .map((p) => p.user_id);

        // DM each player their role and night action (if any), using alive players as targets
        await dmRolesAndNightActions({ game, playerIds: aliveTargetIds, assignments });

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

          res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.EPHEMERAL,
              content: 'Your night action has been recorded.',
            },
          });

          // After acknowledging the interaction, attempt to resolve the night.
          // This will only advance to day once all required night-action roles have acted.
          void maybeResolveNight(gameId);
          return;
        } else if (componentId.startsWith('day_vote:')) {
          const gameId = componentId.replace('day_vote:', '');
          const game = await getGame(gameId);

          if (!game) {
            return res.status(400).json({ error: 'game not found for day vote' });
          }

          if (game.status !== 'day') {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: 'You can only vote during the day.',
              },
            });
          }

          const actorId = req.body.member?.user?.id ?? req.body.user?.id;

          if (!actorId) {
            return res.status(400).json({ error: 'missing voter id' });
          }

          const players = await getPlayersForGame(game.id);
          const alivePlayers = players.filter((p) => p.is_alive);
          const aliveIds = new Set(alivePlayers.map((p) => p.user_id));

          if (!aliveIds.has(actorId)) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: 'Only alive players in the game can vote.',
              },
            });
          }

          const targetId: string | null =
            Array.isArray(data.values) && data.values.length > 0 ? data.values[0] : null;

          if (!targetId || !aliveIds.has(targetId)) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content:
                  'You must vote for a living player who is part of this game.',
              },
            });
          }

          // Record or update the player’s vote for this day.
          await recordDayVote({
            gameId: game.id,
            day: 1,
            voterId: actorId,
            targetId,
          });

          // Acknowledge in the DM.
          res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Your vote to lynch <@${targetId}> has been recorded.`,
            },
          });

          // Also announce in the game channel.
          if (game.channel_id) {
            try {
              await DiscordRequest(`channels/${game.channel_id}/messages`, {
                method: 'POST',
                body: {
                  content: `<@${actorId}> votes to lynch <@${targetId}>.`,
                },
              });
            } catch (err) {
              console.error('Failed to send day vote announcement', err);
            }
          }

          // Attempt to resolve the day based on current votes.
          void maybeResolveDay(game.id);
          return;
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
