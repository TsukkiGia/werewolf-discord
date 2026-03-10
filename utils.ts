import 'dotenv/config';

export interface DiscordRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export interface SlashCommandOption {
  name: string;
  description: string;
  // See https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-types
  // 3 = STRING, 6 = USER, etc.
  type: number;
  required?: boolean;
}

export interface SlashCommand {
  name: string;
  description: string;
  // 1 = CHAT_INPUT
  type: 1;
  options?: SlashCommandOption[];
}

export async function DiscordRequest(
  endpoint: string,
  options: DiscordRequestOptions,
): Promise<Response> {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;

  const { body, ...rest } = options;
  const init: RequestInit = {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': 'DiscordBot (https://github.com/TsukkiGia/werewolf-discord, 1.0.0)',
    },
    ...rest,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  // Use fetch to make requests
  const res = await fetch(url, init);
  // throw API errors
  if (!res.ok) {
    const data = await res.json();
    console.log(res.status);
    throw new Error(JSON.stringify(data));
  }
  // return original response
  return res;
}

export async function InstallGlobalCommands(
  appId: string,
  commands: SlashCommand[],
): Promise<void> {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${appId}/commands`;

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
  } catch (err) {
    console.error(err);
  }
}
