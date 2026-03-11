import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GamePlayerState } from '../db/players.js';
import type { NightActionRow } from '../db/nightActions.js';

// Mock DB client so the module doesn't throw on missing DATABASE_URL
vi.mock('../db/client.js', () => ({
  pool: { query: vi.fn() },
}));

// Capture outgoing DMs without hitting Discord
const sentMessages: { channelId: string; content: string }[] = [];

vi.mock('../utils.js', () => ({
  openDmChannel: vi.fn((userId: string) => Promise.resolve(`dm:${userId}`)),
  postChannelMessage: vi.fn((_channelId: string, body: { content: string }) => {
    sentMessages.push({ channelId: _channelId, content: body.content });
    return Promise.resolve();
  }),
}));

// Import after mocking so the mocks are in place
const { processSeerActions } = await import('../db/nightActions.js');

const players: GamePlayerState[] = [
  { user_id: 'wolf1', role: 'werewolf', alignment: 'wolf', is_alive: true },
  { user_id: 'seer1', role: 'seer', alignment: 'town', is_alive: true },
  { user_id: 'vill1', role: 'villager', alignment: 'town', is_alive: true },
];

function makeAction(id: number, targetId: string): NightActionRow {
  return {
    id,
    game_id: 'g',
    night: 1,
    actor_id: 'sorc1',
    target_id: targetId,
    action_kind: 'inspect',
    role: 'sorcerer',
    created_at: Date.now(),
  };
}

beforeEach(() => {
  sentMessages.length = 0;
});

describe('processSeerActions — sorcerer inspect results', () => {
  it('reports wolf target as wolf-aligned', async () => {
    await processSeerActions(players, [makeAction(1, 'wolf1')]);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.content).toContain('wolves');
    expect(sentMessages[0]!.content).not.toContain('Seer');
  });

  it('reports seer target as the Seer', async () => {
    await processSeerActions(players, [makeAction(2, 'seer1')]);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.content).toContain('Seer');
    expect(sentMessages[0]!.content).not.toContain('wolves');
  });

  it('reports villager as neither wolf nor Seer', async () => {
    await processSeerActions(players, [makeAction(3, 'vill1')]);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.content).toContain('neither');
    // Message says "neither a wolf nor the Seer" — wolves/Seer appear as negations, not identifications
    expect(sentMessages[0]!.content).not.toMatch(/aligned with the \*\*wolves\*\*/);
    expect(sentMessages[0]!.content).not.toMatch(/is the \*\*Seer\*\*/);
  });

  it('DMs the sorcerer (not the target)', async () => {
    await processSeerActions(players, [makeAction(1, 'wolf1')]);
    expect(sentMessages[0]!.channelId).toBe('dm:sorc1');
  });
});

describe('processSeerActions — seer inspect results', () => {
  it('reveals exact role to seer', async () => {
    const seerAction: NightActionRow = {
      id: 10,
      game_id: 'g',
      night: 1,
      actor_id: 'seer1',
      target_id: 'wolf1',
      action_kind: 'inspect',
      role: 'seer',
      created_at: Date.now(),
    };
    await processSeerActions(players, [seerAction]);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.content).toContain('**werewolf**');
  });
});
