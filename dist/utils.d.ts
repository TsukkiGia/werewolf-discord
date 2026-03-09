import 'dotenv/config';
export interface DiscordRequestOptions extends Omit<RequestInit, 'body'> {
    body?: unknown;
}
export interface SlashCommand {
    name: string;
    description: string;
    type: 1;
}
export declare function DiscordRequest(endpoint: string, options: DiscordRequestOptions): Promise<Response>;
export declare function InstallGlobalCommands(appId: string, commands: SlashCommand[]): Promise<void>;
//# sourceMappingURL=utils.d.ts.map