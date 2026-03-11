type InteractionBody = {
  member?: { user?: { id?: string } };
  user?: { id?: string };
  guild_id?: string;
  channel?: { id?: string };
};

type InteractionLike = {
  body?: InteractionBody;
} & InteractionBody;

export function getInteractionUserId(req: InteractionLike): string | null {
  const body: InteractionBody = req.body ?? req;
  return (
    body.member?.user?.id ??
    body.user?.id ??
    null
  );
}

export function getGuildAndChannelIds(req: InteractionLike): {
  guildId: string | null;
  channelId: string | null;
} {
  const body: InteractionBody = req.body ?? req;
  const guildId: string | null = body.guild_id ?? null;
  const channelId: string | null = body.channel?.id ?? null;
  return { guildId, channelId };
}
