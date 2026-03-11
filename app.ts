import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import { InteractionType, InteractionResponseType, verifyKeyMiddleware } from 'discord-interactions';
import { initDb } from './db.js';
import { boss, registerWorkers } from './jobs/dayVoting.js';
import { registerNightWorker } from './jobs/nightTimeout.js';
import { registerDayTimeoutWorker } from './jobs/dayTimeout.js';
import { registerHunterShotTimeoutWorker } from './jobs/hunterShotTimeout.js';
import { maybeResolveNight, maybeResolveDay, resolveHunterShot } from './game/engine/gameOrchestrator.js';
import {
  handleWwCreate,
  handleWwEnd,
  handleWwHelp,
  handleWwStatus,
  handleWwStart,
} from './handlers/commands.js';
import { handleJoinButton, handleNightAction, handleDayVote, handleHunterShot } from './handlers/components.js';

// Ensure database schema exists before handling traffic
await initDb();
await boss.start();
await registerWorkers();
await registerNightWorker(maybeResolveNight);
await registerDayTimeoutWorker((gameId) => maybeResolveDay(gameId, { force: true }));
await registerHunterShotTimeoutWorker((gameId, hunterId) => resolveHunterShot(gameId, hunterId, null));

const app = express();
const PORT: number = Number(process.env.PORT) || 3000;

type Handler = (req: Request, res: Response) => Promise<unknown>;

const commandHandlers: Record<string, Handler> = {
  ww_create: handleWwCreate,
  ww_end: handleWwEnd,
  ww_help: handleWwHelp,
  ww_status: handleWwStatus,
  ww_start: handleWwStart,
};

app.post(
  '/interactions',
  verifyKeyMiddleware(process.env.PUBLIC_KEY as string),
  async (req: Request, res: Response) => {
    const { type, data } = req.body;

    if (type === InteractionType.PING) {
      return res.send({ type: InteractionResponseType.PONG });
    }

    if (type === InteractionType.APPLICATION_COMMAND) {
      const handler = commandHandlers[data.name];
      if (!handler) {
        console.error(`unknown command: ${data.name}`);
        return res.status(400).json({ error: 'unknown command' });
      }
      return handler(req, res);
    }

    if (type === InteractionType.MESSAGE_COMPONENT) {
      const componentId: string = data.custom_id;

      if (componentId.startsWith('join_button_')) return handleJoinButton(req, res, componentId);
      if (componentId.startsWith('night_action:')) return handleNightAction(req, res, componentId);
      if (componentId.startsWith('day_vote:')) return handleDayVote(req, res, componentId);
      if (componentId.startsWith('hunter_shot:')) return handleHunterShot(req, res, componentId);

      console.error(`unknown component: ${componentId}`);
      return res.status(400).json({ error: 'unknown component' });
    }

    console.error('unknown interaction type', type);
    return res.status(400).json({ error: 'unknown interaction type' });
  },
);

app.get('/', (_req, res) => {
  res.send('Werewolf Discord bot server is running.');
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});

export default app;
