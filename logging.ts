export function logEvent(event: string, data: Record<string, unknown> = {}): void {
  // Simple structured application-level log line.
  // Example:
  // {"ts": 1773200953424,"event":"day_vote_dm_send","gameId":"...","day":1,"userId":"..."}
  console.log(
    JSON.stringify({
      ts: Date.now(),
      event,
      ...data,
    }),
  );
}

