import {
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
} from 'discord-interactions';
import {
  getGame,
  addPlayer,
  getPlayersForGame,
  recordNightAction,
  recordDayVote,
  hasNightAction,
  hasDayVote,
} from '../db.js';
import { postChannelMessage } from '../utils.js';
import { ROLE_REGISTRY, isRoleName } from '../game/balancing/roleRegistry.js';
import { getInteractionUserId } from '../interactionHelpers.js';
import { maybeResolveNight, maybeResolveDay } from '../game/engine/gameOrchestrator.js';
import { buildJoinClosedComponents } from './commands.js';

export async function handleJoinButton(req: any, res: any, componentId: string): Promise<any> {
  const gameId = componentId.replace('join_button_', '');
  const game = await getGame(gameId);

  if (!game) {
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: 'This game no longer exists.',
          },
        ],
      },
    });
  }

  if (game.status !== 'lobby') {
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: buildJoinClosedComponents(),
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
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
        {
          type: MessageComponentTypes.TEXT_DISPLAY,
          content: `<@${userId}> joined the game.`,
        },
      ],
    },
  });
}

export async function handleNightAction(req: any, res: any, componentId: string): Promise<any> {
  const withoutPrefix = componentId.replace('night_action:', '');
  const [gameId, role] = withoutPrefix.split(':');

  const targetId: string | null =
    Array.isArray(req.body.data.values) && req.body.data.values.length > 0
      ? req.body.data.values[0]
      : null;

  const actorId = getInteractionUserId(req);

  if (!actorId || !gameId || !role) {
    return res.status(400).json({ error: 'invalid night action payload' });
  }

  const game = await getGame(gameId);
  if (!game || game.status !== 'night') {
    return res.status(400).json({ error: 'no active night for this game' });
  }

  const nightNumber = game.current_night || 1;

  if (await hasNightAction(gameId, nightNumber, actorId)) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: 'You have already submitted your night action. It cannot be changed.',
      },
    });
  }

  if (!isRoleName(role)) {
    return res.status(400).json({ error: 'invalid role in night action payload' });
  }
  const def = ROLE_REGISTRY[role];

  const inserted = await recordNightAction({
    gameId,
    night: nightNumber,
    actorId,
    targetId,
    actionKind: def.nightAction.kind,
    role: def.name,
  });

  if (!inserted) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: 'You have already submitted your night action. It cannot be changed.',
      },
    });
  }

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

  void maybeResolveNight(gameId);
}

export async function handleDayVote(req: any, res: any, componentId: string): Promise<any> {
  const gameId = componentId.replace('day_vote:', '');
  const game = await getGame(gameId);

  if (!game) {
    return res.status(400).json({ error: 'game not found for day vote' });
  }

  if (game.status !== 'day') {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'You can only vote during the day.' },
    });
  }

  const actorId = getInteractionUserId(req);
  if (!actorId) {
    return res.status(400).json({ error: 'missing voter id' });
  }

  const players = await getPlayersForGame(game.id);
  const aliveIds = new Set(players.filter((p) => p.is_alive).map((p) => p.user_id));

  if (!aliveIds.has(actorId)) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'Only alive players in the game can vote.' },
    });
  }

  const targetId: string | null =
    Array.isArray(req.body.data.values) && req.body.data.values.length > 0
      ? req.body.data.values[0]
      : null;

  if (!targetId || !aliveIds.has(targetId)) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'You must vote for a living player who is part of this game.' },
    });
  }

  const dayNumber = game.current_day || 1;

  if (await hasDayVote(game.id, dayNumber, actorId)) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'You have already voted today. Your vote cannot be changed.' },
    });
  }

  const inserted = await recordDayVote({ gameId: game.id, day: dayNumber, voterId: actorId, targetId });

  if (!inserted) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'You have already voted today. Your vote cannot be changed.' },
    });
  }

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

  if (game.channel_id) {
    try {
      await postChannelMessage(game.channel_id, {
        content: `<@${actorId}> votes to lynch <@${targetId}>.`,
      });
    } catch (err) {
      console.error('Failed to send day vote announcement', err);
    }
  }

  void maybeResolveDay(game.id);
}
