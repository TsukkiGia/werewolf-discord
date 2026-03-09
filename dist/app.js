import 'dotenv/config';
import express from 'express';
import { InteractionType, InteractionResponseType, verifyKeyMiddleware, } from 'discord-interactions';
// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = Number(process.env.PORT) || 3000;
// Middleware to expose rawBody for discord-interactions verification
app.use(express.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf-8');
    },
}));
// Store for in-progress games. In production, you'd want to use a DB.
const activeGames = {};
/**
 * Interactions endpoint URL where Discord will send HTTP requests.
 * Parses request body and verifies incoming requests using discord-interactions.
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async (req, res) => {
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
        // "test" command
        if (name === 'test') {
            // TODO: implement /test command behavior
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: 'Test command not implemented yet.',
                },
            });
        }
        // "challenge" command
        if (name === 'challenge' && id) {
            // TODO: implement /challenge command behavior and game setup
            activeGames[id] = {};
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: 'Challenge command not implemented yet.',
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
        const componentId = data.custom_id;
        if (componentId.startsWith('accept_button_')) {
            // TODO: implement accept button behavior
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: 'Accept button interaction not implemented yet.',
                },
            });
        }
        else if (componentId.startsWith('select_choice_')) {
            // TODO: implement choice selection behavior
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: 'Select choice interaction not implemented yet.',
                },
            });
        }
        console.error(`unknown component: ${componentId}`);
        return res.status(400).json({ error: 'unknown component' });
    }
    console.error('unknown interaction type', type);
    return res.status(400).json({ error: 'unknown interaction type' });
});
// Simple health check / welcome route
app.get('/', (_req, res) => {
    res.send('Werewolf Discord bot server is running.');
});
app.listen(PORT, () => {
    console.log('Listening on port', PORT);
});
export default app;
//# sourceMappingURL=app.js.map