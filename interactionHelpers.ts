export function getInteractionUserId(req: any): string | null {
  const body = req.body ?? req;
  return (
    body.member?.user?.id ??
    body.user?.id ??
    null
  );
}

export function getGuildAndChannelIds(req: any): {
  guildId: string | null;
  channelId: string | null;
} {
  const body = req.body ?? req;
  const guildId: string | null = body.guild_id ?? null;
  const channelId: string | null = body.channel?.id ?? null;
  return { guildId, channelId };
}

