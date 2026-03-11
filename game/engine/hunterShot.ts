import {
  InteractionResponseFlags,
  MessageComponentTypes,
} from 'discord-interactions';
import type { GameRow } from '../../db/games.js';
import type { GamePlayerState } from '../../db/players.js';
import { createHunterShot } from '../../db/hunterShots.js';
import { openDmChannel, postChannelMessage } from '../../utils.js';
import { getDisplayName } from './dmRoles.js';
import { boss } from '../../jobs/dayVoting.js';

export async function triggerHunterShot(params: {
  game: GameRow;
  hunterId: string;
  continuation: string;
  alivePlayers: GamePlayerState[];
}): Promise<void> {
  const { game, hunterId, continuation, alivePlayers } = params;

  const inserted = await createHunterShot({ gameId: game.id, hunterId, continuation });
  if (!inserted) {
    // Shot already exists; don't re-trigger
    return;
  }

  try {
    const dmChannelId = await openDmChannel(hunterId);

    const options = [];
    for (const player of alivePlayers) {
      const label = await getDisplayName(player.user_id, game.guild_id);
      options.push({ label, value: player.user_id });
    }

    await postChannelMessage(dmChannelId, {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: [
        {
          type: MessageComponentTypes.TEXT_DISPLAY,
          content:
            'You have been eliminated — but as the Hunter, you still have one last shot. Choose a player to take down with you, or let the timer run out to die in silence.',
        },
        {
          type: MessageComponentTypes.ACTION_ROW,
          components: [
            {
              type: MessageComponentTypes.STRING_SELECT,
              custom_id: `hunter_shot:${game.id}`,
              placeholder: 'Choose a player to shoot',
              min_values: 1,
              max_values: 1,
              options,
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error('Failed to DM hunter shot prompt to user', hunterId, err);
  }

  await boss.send(
    'hunter-shot',
    { gameId: game.id, hunterId },
    { startAfter: 30, singletonKey: `${game.id}-hunter-${hunterId}` },
  );
}
