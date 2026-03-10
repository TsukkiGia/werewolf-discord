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
  hasNightAction,
  hasDayVote,
} from './db.js';
import { DiscordRequest } from './utils.js';
import { ROLE_REGISTRY } from './game/balancing/roleRegistry.js';
import { dmRolesAndNightActions, startDayVoting } from './game/engine/dmRoles.js';
import { chooseKillVictim, evaluateNightResolution } from './game/engine/nightResolution.js';
import { evaluateDayResolution } from './game/engine/dayResolution.js';
import { evaluateWinCondition } from './game/engine/winConditions.js';
import { buildStatusLines } from './game/engine/status.js';
import { getInteractionUserId, getGuildAndChannelIds } from './interactionHelpers.js';

function scheduleDayVoting(gameId: string, dayNumber: number): void {
  // In-memory timer: if the process restarts, the scheduled call is lost.
  setTimeout(async () => {
    try {
      const game = await getGame(gameId);
      if (!game || game.status !== 'day') return;
      if ((game.current_day || 0) !== dayNumber) return;

      const players = await getPlayersForGame(gameId);
      await startDayVoting({ game, players, dayNumber });
    } catch (err) {
      console.error('Error scheduling day voting', err);
    }
  }, 60_000);
}

async function maybeResolveNight(gameId: string): Promise<void> {
  try {
    const game = await getGame(gameId);
    if (!game || game.status !== 'night') {
      return;
    }

    const nightNumber = game.current_night || 1;

    const players = await getPlayersForGame(gameId);
    const actions = await getNightActionsForNight(gameId, nightNumber);

    const nightResolution = evaluateNightResolution(players, actions);
    if (nightResolution.state === 'pending') {
      // Wait until all required night-action roles have acted.
      return;
    }

    // Everyone has acted; resolve night using the derived targets.
    const { killTargets, protectTargets } = nightResolution;

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

    // Re-read players after applying night kills and evaluate win conditions.
    const updatedPlayers = await getPlayersForGame(gameId);
    const win = evaluateWinCondition(updatedPlayers);
    const upcomingDay = (game.current_day || 0) + 1;

    if (game.channel_id) {
      const victims = updatedPlayers.filter((p) => killedIds.includes(p.user_id));
      const lines: string[] = [];

      if (victims.length === 0) {
        lines.push('Dawn breaks. No one was eliminated during the night.');
      } else {
        const victimLines = victims.map(
          (v) =>
            `<@${v.user_id}> was eliminated during the night. They were a **${v.role}**.`,
        );
        lines.push('Dawn breaks.');
        lines.push(...victimLines);
      }

      if (win) {
        lines.push(
          win.winner === 'town'
            ? 'Town has eliminated all werewolves. Town wins!'
            : 'Wolves now control the village. Wolves win!',
        );
      } else {
        lines.push(
          `Day ${upcomingDay} begins. You have 1 minute to discuss before voting starts.`,
        );
      }

      try {
        await DiscordRequest(`channels/${game.channel_id}/messages`, {
          method: 'POST',
          body: { content: lines.join('\n') },
        });
      } catch (err) {
        console.error('Failed to send day summary message', err);
      }
    }

    if (win) {
      await endGame(gameId);
      return;
    }

    // No winner yet: advance to the next phase (night -> day).
    await advancePhase(gameId);

    // After announcing dawn, wait one minute before starting voting.
    scheduleDayVoting(gameId, upcomingDay);
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

    const dayNumber = game.current_day || 1;

    const players = await getPlayersForGame(gameId);
    const votes = await getVotesForDay(gameId, dayNumber);

    const resolution = evaluateDayResolution(players, votes);
    if (resolution.state === 'pending') {
      // Still waiting for all alive players to vote.
      return;
    }

    if (resolution.state === 'no_lynch') {
      if (game.channel_id) {
        const lines: string[] = [
          `Day ${dayNumber} ends with no majority. No one is lynched.`,
          'Night falls...',
        ];

        try {
          await DiscordRequest(`channels/${game.channel_id}/messages`, {
            method: 'POST',
            body: { content: lines.join('\n') },
          });
        } catch (err) {
          console.error('Failed to send no-lynch day resolution message', err);
        }
      }

      await advancePhase(gameId); // day -> night
      return;
    }

    const lynchId = resolution.lynchId;

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
	        const userId = getInteractionUserId(req);
          if (!userId) {
            return res.status(400).json({ error: 'missing user id' });
          }

	        const gameId = String(id);
	        const { guildId, channelId } = getGuildAndChannelIds(req);

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
        const { guildId, channelId } = getGuildAndChannelIds(req);

        const game = await getActiveGameForChannel(guildId, channelId);

        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'There is no active Werewolf game in this channel to end.',
            },
          });
        }

        const userId = getInteractionUserId(req);
        if (!userId) {
          return res.status(400).json({ error: 'missing user id' });
        }

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
        const helpLines: string[] = [
          '**Werewolf bot help**',
          '',
          '**Commands:**',
          '• `/ww_create` – Start a new game in this channel and become the host.',
          '• `/ww_start` – Host-only; assign roles and begin Night 1.',
          '• `/ww_status` – Show the current phase, day/night number, and players.',
          '• `/ww_end` – Host-only; end the current game in this channel.',
          '',
          '**How it works:**',
          '1. Host runs `/ww_create`, other players click **Join**.',
          '2. Host runs `/ww_start` to assign roles and start Night 1.',
          '3. Everyone receives a DM with their role. Roles with night actions (werewolf, seer, doctor) also get a DM menu to choose a target.',
          '4. When all required night actions are submitted, night resolves automatically.',
          '5. At dawn, the bot announces any deaths, then gives the channel 1 minute to discuss.',
          '6. After 1 minute, alive players receive a DM to vote on a lynch. Votes are announced in the channel and resolve automatically when there is a majority.',
          '',
          'The game ends automatically when either all wolves are dead (town wins) or only wolves are left alive (wolves win).',
        ];

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: helpLines.join('\n'),
          },
        });
      }

      if (name === 'ww_status') {
        const { guildId, channelId } = getGuildAndChannelIds(req);

        const game = await getActiveGameForChannel(guildId, channelId);

        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'There is no active Werewolf game in this channel.',
            },
          });
        }

        const players = await getPlayersForGame(game.id);
        const messageLines = buildStatusLines(game, players);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: messageLines.join('\n'),
          },
        });
      }

      if (name === 'ww_start') {
        const { guildId, channelId } = getGuildAndChannelIds(req);

        const game = await getActiveGameForChannel(guildId, channelId);

        if (!game) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'There is no active Werewolf game in this channel to start.',
            },
          });
        }

        const userId = getInteractionUserId(req);
        if (!userId) {
          return res.status(400).json({ error: 'missing user id' });
        }

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

	          const userId = getInteractionUserId(req);
            if (!userId) {
              return res.status(400).json({ error: 'missing user id' });
            }
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

	          const actorId = getInteractionUserId(req);

	          if (!actorId || !gameId || !role) {
	            return res.status(400).json({ error: 'invalid night action payload' });
	          }

            const gameForNight = await getGame(gameId);

            if (!gameForNight || gameForNight.status !== 'night') {
              return res.status(400).json({ error: 'no active night for this game' });
            }

            const nightNumber = gameForNight.current_night || 1;

            if (await hasNightAction(gameId, nightNumber, actorId)) {
              return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  flags: InteractionResponseFlags.EPHEMERAL,
                  content: 'You have already submitted your night action. It cannot be changed.',
                },
              });
            }

          const def = ROLE_REGISTRY[role as keyof typeof ROLE_REGISTRY];

          await recordNightAction({
            gameId,
            night: nightNumber,
            actorId,
            targetId,
            actionKind: def.nightAction.kind,
            role: def.name,
          });

          const verb =
            def.nightAction.kind === 'kill'
              ? 'attack'
              : def.nightAction.kind === 'inspect'
                ? 'inspect'
                : def.nightAction.kind === 'protect'
                  ? 'protect'
                  : 'act on';

          const confirmation =
            targetId != null
              ? `Your night action has been recorded: you chose to ${verb} <@${targetId}>.`
              : 'Your night action has been recorded.';

          res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: confirmation,
                },
              ],
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

          const actorId = getInteractionUserId(req);

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

          const dayNumber = game.current_day || 1;

          if (await hasDayVote(game.id, dayNumber, actorId)) {
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content:
                  'You have already voted today. Your vote cannot be changed.',
              },
            });
          }

          // Record the player’s vote for this day.
          await recordDayVote({
            gameId: game.id,
            day: dayNumber,
            voterId: actorId,
            targetId,
          });

          // Update the DM to remove the select and show confirmation.
          res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: `Your vote to lynch <@${targetId}> has been recorded.`,
                },
              ],
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
