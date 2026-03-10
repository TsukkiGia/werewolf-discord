// Register slash commands for the Werewolf bot using the shared utils.
// Run with: `node commands.js` (or `npm run register`).
import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';
import type {SlashCommand} from './utils.js';

const APP_ID: string | undefined = process.env.APP_ID;

// Define the application (slash) commands.
// Names are the part after the leading slash, e.g. `/ww_create`.
const WW_COMMANDS: SlashCommand[] = [
  {
    name: 'ww_create',
    description: 'Create a new Werewolf game',
    type: 1, // CHAT_INPUT
  },
  {
    name: 'ww_help',
    description: 'Show help for the Werewolf game',
    type: 1, // CHAT_INPUT
  },
  {
    name: 'ww_end',
    description: 'End the current Werewolf game',
    type: 1, // CHAT_INPUT
  },
  {
    name: 'ww_status',
    description: 'Show the current Werewolf game status in this channel',
    type: 1, // CHAT_INPUT
  },
];

async function main() {
    if (!APP_ID) {
    console.error('APP_ID must be set in the environment.');
    process.exit(1);
  }
  await InstallGlobalCommands(APP_ID, WW_COMMANDS);
  console.log('Successfully registered application commands.');
}

main().catch((err) => {
  console.error('Error registering commands:', err);
});
