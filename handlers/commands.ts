import {
  InteractionResponseType,
  InteractionResponseFlags,
  ButtonStyleTypes,
  MessageComponentTypes,
} from 'discord-interactions';
import {
  createGame,
  addPlayer,
  getActiveGameForChannel,
  getPlayerIdsForGame,
  startGame,
  assignRolesForGame,
  getPlayersForGame,
  endGame,
  setJoinMessageId,
} from '../db.js';
import { DiscordRequest } from '../utils.js';
import { dmRolesAndNightActions } from '../game/engine/dmRoles.js';
import { scheduleNightTimeout } from '../jobs/nightTimeout.js';
import { buildStatusLines } from '../game/engine/status.js';
import { getInteractionUserId, getGuildAndChannelIds } from '../interactionHelpers.js';

export function buildJoinClosedComponents(): any[] {
  return [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: 'This game is already in progress or has ended. Joining is closed.',
    },
  ];
}

export async function handleWwCreate(req: any, res: any): Promise<any> {
  const { id } = req.body;
  const userId = getInteractionUserId(req);
  if (!userId) {
    return res.status(400).json({ error: 'missing user id' });
  }

  const gameId = String(id);
  const { guildId, channelId } = getGuildAndChannelIds(req);

  const existingGame = await getActiveGameForChannel(guildId, channelId);
  if (existingGame) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `There is already an active Werewolf game in this channel started by <@${existingGame.host_id}>.`,
      },
    });
  }

  const created = await createGame({ id: gameId, guildId, channelId, hostId: userId });
  if (!created) {
    const concurrent = await getActiveGameForChannel(guildId, channelId);
    const hostMention = concurrent ? `<@${concurrent.host_id}>` : 'someone else';
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `There is already an active Werewolf game in this channel started by ${hostMention}.`,
      },
    });
  }

  await addPlayer(gameId, userId);

  if (channelId) {
    try {
      const msgRes = await DiscordRequest(`channels/${channelId}/messages`, {
        method: 'POST',
        body: {
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
                  custom_id: `join_button_${gameId}`,
                  label: 'Join',
                  style: ButtonStyleTypes.PRIMARY,
                },
              ],
            },
          ],
        },
      });

      const msg = (await msgRes.json()) as { id?: string };
      if (msg.id) {
        await setJoinMessageId(gameId, msg.id);
      }
    } catch (err) {
      console.error('Failed to send join message for new game', err);
    }
  }

  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `Created a new Werewolf game in this channel. Players can click **Join** to participate.`,
    },
  });
}

export async function handleWwEnd(req: any, res: any): Promise<any> {
  const { guildId, channelId } = getGuildAndChannelIds(req);
  const game = await getActiveGameForChannel(guildId, channelId);

  if (!game) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'There is no active Werewolf game in this channel to end.' },
    });
  }

  const userId = getInteractionUserId(req);
  if (!userId) {
    return res.status(400).json({ error: 'missing user id' });
  }

  if (userId !== game.host_id) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Only the host <@${game.host_id}> can end this game.` },
    });
  }

  await endGame(game.id);

  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: `The Werewolf game in this channel has been ended by <@${userId}>.` },
  });
}

export async function handleWwHelp(_req: any, res: any): Promise<any> {
  const helpLines = [
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
    data: { content: helpLines.join('\n') },
  });
}

export async function handleWwStatus(req: any, res: any): Promise<any> {
  const { guildId, channelId } = getGuildAndChannelIds(req);
  const game = await getActiveGameForChannel(guildId, channelId);

  if (!game) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'There is no active Werewolf game in this channel.' },
    });
  }

  const players = await getPlayersForGame(game.id);
  const messageLines = buildStatusLines(game, players);

  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: messageLines.join('\n') },
  });
}

export async function handleWwStart(req: any, res: any): Promise<any> {
  const { guildId, channelId } = getGuildAndChannelIds(req);
  const game = await getActiveGameForChannel(guildId, channelId);

  if (!game) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'There is no active Werewolf game in this channel to start.' },
    });
  }

  const userId = getInteractionUserId(req);
  if (!userId) {
    return res.status(400).json({ error: 'missing user id' });
  }

  if (userId !== game.host_id) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Only the host <@${game.host_id}> can start this game.` },
    });
  }

  const playerIds = await getPlayerIdsForGame(game.id);
  if (playerIds.length < 2) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'You need at least 3 players to start a Werewolf game.' },
    });
  }

  if (game.channel_id && game.join_message_id) {
    try {
      await DiscordRequest(`channels/${game.channel_id}/messages/${game.join_message_id}`, {
        method: 'PATCH',
        body: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: buildJoinClosedComponents(),
        },
      });
    } catch (err) {
      console.error('Failed to patch join message on game start', err);
    }
  }

  const didStart = await startGame(game.id);
  if (!didStart) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'This game has already been started.' },
    });
  }

  const assignments = await assignRolesForGame(game.id);
  const playersForTargets = await getPlayersForGame(game.id);
  const aliveTargetIds = playersForTargets.filter((p) => p.is_alive).map((p) => p.user_id);

  await dmRolesAndNightActions({ game, playerIds: aliveTargetIds, assignments, nightNumber: 1 });
  await scheduleNightTimeout(game.id, 1); // startGame increments current_night 0 → 1

  const playersText =
    playerIds.length > 0
      ? playerIds.map((id: string) => `<@${id}>`).join(', ')
      : 'No players (this should not happen).';

  if (game.channel_id) {
    try {
      await DiscordRequest(`channels/${game.channel_id}/messages`, {
        method: 'POST',
        body: {
          content: `The Werewolf game has started!\nHost: <@${game.host_id}>\nPlayers: ${playersText}`,
        },
      });
    } catch (err) {
      console.error('Failed to send game started message', err);
    }
  }

  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: 'The Werewolf game has been started.' },
  });
}
