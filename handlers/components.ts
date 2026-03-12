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
  recordLovers,
  setTroublemakerDoubleLynchDay,
} from '../db.js';
import { postChannelMessage, sendDmMessage } from '../utils.js';
import { ROLE_REGISTRY, isRoleName } from '../game/balancing/roleRegistry.js';
import { getInteractionUserId } from '../interactionHelpers.js';
import { maybeResolveNight, maybeResolveDay, resolveHunterShot } from '../game/engine/gameOrchestrator.js';
import { buildJoinClosedComponents } from './commands.js';
import { logEvent } from '../logging.js';
import type { Request, Response } from 'express';

// Track Cupid's first Lover selection between the first and second DM step.
const cupidFirstPicks = new Map<string, string>(); // key: `${gameId}:${cupidId}` → first lover ID

export async function handleJoinButton(req: Request, res: Response, componentId: string) {
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

  const existingPlayers = await getPlayersForGame(gameId);
  if (existingPlayers.some((p) => p.user_id === userId)) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: 'You have already joined this game.',
      },
    });
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

export async function handleCupidFirstPick(req: Request, res: Response, componentId: string) {
  const gameId = componentId.replace('cupid_link1:', '');
  const game = await getGame(gameId);

  if (!game || game.status !== 'night') {
    return res.status(400).json({ error: 'no active night for this game' });
  }

  const cupidId = getInteractionUserId(req);
  if (!cupidId) {
    return res.status(400).json({ error: 'missing user id' });
  }

  const players = await getPlayersForGame(gameId);
  const cupid = players.find((p) => p.user_id === cupidId);

  if (!cupid || !cupid.is_alive || cupid.role !== 'cupid') {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: 'You are not Cupid in this game.',
      },
    });
  }

  const nightNumber = game.current_night || 1;
  if (nightNumber !== 1) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: 'Cupid can only choose Lovers on Night 1.',
      },
    });
  }

  const firstId: string | null =
    Array.isArray(req.body.data.values) && req.body.data.values.length > 0
      ? req.body.data.values[0]
      : null;

  if (!firstId || firstId === cupidId) {
    return res.status(400).json({ error: 'invalid first lover selection' });
  }

  const aliveIds = new Set(players.filter((p) => p.is_alive).map((p) => p.user_id));
  if (!aliveIds.has(firstId)) {
    return res.status(400).json({ error: 'first lover must be an alive player' });
  }

  cupidFirstPicks.set(`${gameId}:${cupidId}`, firstId);

  const secondOptions = players
    .filter((p) => p.is_alive && p.user_id !== cupidId && p.user_id !== firstId)
    .map((p) => ({ label: `<@${p.user_id}>`, value: p.user_id }));

  if (secondOptions.length === 0) {
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: 'There is no valid second Lover to choose.',
          },
        ],
      },
    });
  }

  return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
        {
          type: MessageComponentTypes.TEXT_DISPLAY,
          content: `You chose <@${firstId}> as the first Lover. Now choose the second Lover.`,
        },
        {
          type: MessageComponentTypes.ACTION_ROW,
          components: [
            {
              type: MessageComponentTypes.STRING_SELECT,
              custom_id: `cupid_link2:${gameId}:${firstId}`,
              placeholder: 'Choose the second Lover',
              min_values: 1,
              max_values: 1,
              options: secondOptions,
            },
          ],
        },
      ],
    },
  });
}

export async function handleCupidSecondPick(req: Request, res: Response, componentId: string) {
  const withoutPrefix = componentId.replace('cupid_link2:', '');
  const [gameId, firstIdFromId] = withoutPrefix.split(':') as [string, string];

  const game = await getGame(gameId);
  if (!game || game.status !== 'night') {
    return res.status(400).json({ error: 'no active night for this game' });
  }

  const cupidId = getInteractionUserId(req);
  if (!cupidId) {
    return res.status(400).json({ error: 'missing user id' });
  }

  const players = await getPlayersForGame(gameId);
  const cupid = players.find((p) => p.user_id === cupidId);
  if (!cupid || !cupid.is_alive || cupid.role !== 'cupid') {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: 'You are not Cupid in this game.',
      },
    });
  }

  const key = `${gameId}:${cupidId}`;
  const firstIdStored = cupidFirstPicks.get(key);
  const firstId = firstIdStored ?? firstIdFromId;

  const secondId: string | null =
    Array.isArray(req.body.data.values) && req.body.data.values.length > 0
      ? req.body.data.values[0]
      : null;

  if (!firstId || !secondId || firstId === secondId || secondId === cupidId) {
    return res.status(400).json({ error: 'invalid second lover selection' });
  }

  const aliveIds = new Set(players.filter((p) => p.is_alive).map((p) => p.user_id));
  if (!aliveIds.has(firstId) || !aliveIds.has(secondId)) {
    return res.status(400).json({ error: 'lovers must both be alive players' });
  }

  cupidFirstPicks.delete(key);

  // Persist Lovers to the DB and mark Cupid's night action as completed.
  await recordLovers({ gameId, loverAId: firstId, loverBId: secondId });

  const nightNumber = game.current_night || 1;
  await recordNightAction({
    gameId,
    night: nightNumber,
    actorId: cupidId,
    targetId: secondId,
    actionKind: 'link',
    role: 'cupid',
  });

  logEvent('cupid_link', {
    gameId,
    night: nightNumber,
    cupidId,
    loverAId: firstId,
    loverBId: secondId,
  });

  await res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
        {
          type: MessageComponentTypes.TEXT_DISPLAY,
          content: `You have linked <@${firstId}> and <@${secondId}> as Lovers.`,
        },
      ],
    },
  });

  // DM the Lovers that they are linked, without revealing roles.
  const loverMessage = (partnerId: string) =>
    `You feel Cupid’s arrow strike. You are now in love with <@${partnerId}>. If one of you dies, the other will die of sorrow. If both of you survive and at least one of you is on the winning side, you both win together.`;

  void (async () => {
    try {
      await sendDmMessage(firstId, { content: loverMessage(secondId) });
      await sendDmMessage(secondId, { content: loverMessage(firstId) });
    } catch (err) {
      console.error('Failed to DM Lovers after Cupid link', gameId, cupidId, err);
    }
  })();

  void maybeResolveNight(gameId);
}

export async function handleTroublemakerDoubleLynch(
  req: Request,
  res: Response,
  componentId: string,
): Promise<void> {
  const withoutPrefix = componentId.replace('troublemaker_double_lynch:', '');
  const [gameId, dayStr] = withoutPrefix.split(':');
  const requestedDay = Number(dayStr);

  const game = await getGame(gameId);
  if (!game || game.status !== 'day') {
    return res.status(400).json({ error: 'no active day for this game' });
  }

  const currentDay = game.current_day || 1;
  if (requestedDay !== currentDay) {
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: 'This troublemaking button is from a previous day and cannot be used.',
          },
        ],
      },
    });
  }

  const actorId = getInteractionUserId(req);
  if (!actorId) {
    return res.status(400).json({ error: 'missing user id' });
  }

  const players = await getPlayersForGame(gameId);
  const actor = players.find((p) => p.user_id === actorId);

  if (!actor || !actor.is_alive || actor.role !== 'troublemaker') {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: 'You are not the TroubleMaker in this game.',
      },
    });
  }

  if (game.troublemaker_double_lynch_day != null) {
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: 'You have already made trouble earlier this game. You can only do this once.',
          },
        ],
      },
    });
  }

  const set = await setTroublemakerDoubleLynchDay(gameId, currentDay);
  if (!set) {
    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: 'Someone else has already made trouble this game.',
          },
        ],
      },
    });
  }

  await res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
        {
          type: MessageComponentTypes.TEXT_DISPLAY,
          content:
            'You kick over the hornet’s nest. The village is in an uproar — they will attempt **two lynches** today.',
        },
      ],
    },
  });

  if (game.channel_id) {
    try {
      await postChannelMessage(game.channel_id, {
        content:
          'The village erupts into chaos. The anger runs high — today there will be **two lynches**.',
      });
    } catch (err) {
      console.error('Failed to announce TroubleMaker double lynch', err);
    }
  }
}

export async function handleNightAction(req: Request, res: Response, componentId: string) {
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

  const isIgnite = targetId === '__ARSONIST_IGNITE__';
  const inserted = await recordNightAction({
    gameId,
    night: nightNumber,
    actorId,
    targetId: isIgnite ? null : targetId,
    actionKind: isIgnite ? 'ignite' : def.nightAction.kind,
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
  } else {
    logEvent('night_action_record', {
      gameId,
      night: nightNumber,
      actorId,
      role: def.name,
      actionKind: def.nightAction.kind,
      targetId,
    });
  }

  const verb =
    def.nightAction.kind === 'kill'
      ? 'attack'
      : def.nightAction.kind === 'inspect'
        ? 'inspect'
        : def.nightAction.kind === 'protect'
          ? 'protect'
          : def.nightAction.kind === 'visit'
            ? 'visit'
            : def.nightAction.kind === 'link'
              ? 'link'
              : 'act on';

  const confirmation =
    targetId != null
      ? `Your night action has been recorded: you chose to ${verb} <@${targetId}>.`
      : 'Your night action has been recorded.';

  await res.send({
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

  // If a werewolf submits a kill target, notify the other wolves in DMs.
  if (def.name === 'werewolf' && def.nightAction.kind === 'kill' && targetId) {
    void (async () => {
      try {
        const players = await getPlayersForGame(gameId);
        const otherWolves = players.filter(
          (p) => p.is_alive && p.user_id !== actorId && p.role === 'werewolf',
        );

        if (otherWolves.length === 0) return;

        const content = `Wolf vote: <@${actorId}> has chosen to attack <@${targetId}> tonight.`;

        await Promise.all(
          otherWolves.map((p) =>
            sendDmMessage(p.user_id, {
              content,
            }),
          ),
        );
      } catch (err) {
        console.error('Failed to DM wolf vote to pack members', gameId, actorId, err);
      }
    })();
  }

  void maybeResolveNight(gameId);
}

export async function handleDayVote(req: Request, res: Response, componentId: string) {
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

  // Clumsy Guy mechanic: 50% chance their vote goes to a random
  // living player (still never themselves) instead of their choice.
  let finalTargetId = targetId;
  const actor = players.find((p) => p.user_id === actorId);
  if (actor?.role === 'clumsy_guy') {
    const roll = Math.random();
    if (roll < 0.5) {
      const eligibleTargets = players
        .filter((p) => p.is_alive && p.user_id !== actorId)
        .map((p) => p.user_id);
      if (eligibleTargets.length > 0) {
        const index = Math.floor(Math.random() * eligibleTargets.length);
        finalTargetId = eligibleTargets[index]!;
      }
    }
  }

  const inserted = await recordDayVote({
    gameId: game.id,
    day: dayNumber,
    voterId: actorId,
    targetId: finalTargetId,
  });

  if (!inserted) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'You have already voted today. Your vote cannot be changed.' },
    });
  } else {
    logEvent('day_vote_record', {
      gameId: game.id,
      day: dayNumber,
      voterId: actorId,
      targetId: finalTargetId,
    });
  }

  await res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
          {
            type: MessageComponentTypes.TEXT_DISPLAY,
            content: `Your vote to lynch <@${finalTargetId}> has been recorded.`,
        },
      ],
    },
  });

  if (game.channel_id) {
    try {
      await postChannelMessage(game.channel_id, {
        content: `<@${actorId}> votes to lynch <@${finalTargetId}>.`,
      });
    } catch (err) {
      console.error('Failed to send day vote announcement', err);
    }
  }

  void maybeResolveDay(game.id);
}

export async function handleHunterShot(req: Request, res: Response, componentId: string) {
  const gameId = componentId.replace('hunter_shot:', '');

  const game = await getGame(gameId);
  if (!game || game.status === 'ended') {
    return res.status(400).json({ error: 'game not found or already ended' });
  }

  const hunterId = getInteractionUserId(req);
  if (!hunterId) {
    return res.status(400).json({ error: 'missing user id' });
  }

  const players = await getPlayersForGame(gameId);
  const hunter = players.find((p) => p.user_id === hunterId);

  if (!hunter || hunter.role !== 'hunter' || hunter.is_alive) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: 'You are not an eliminated Hunter in this game.',
      },
    });
  }

  const targetId: string | null =
    Array.isArray(req.body.data.values) && req.body.data.values.length > 0
      ? req.body.data.values[0]
      : null;

  if (!targetId) {
    return res.status(400).json({ error: 'no target selected' });
  }

  const aliveIds = new Set(players.filter((p) => p.is_alive).map((p) => p.user_id));
  if (!aliveIds.has(targetId)) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: 'You must shoot a living player who is part of this game.',
      },
    });
  }

  res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
        {
          type: MessageComponentTypes.TEXT_DISPLAY,
          content: `You have chosen to shoot <@${targetId}>. Your shot has been recorded.`,
        },
      ],
    },
  });

  void resolveHunterShot(gameId, hunterId, targetId);
}
