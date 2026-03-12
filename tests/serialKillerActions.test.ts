import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GamePlayerState } from '../db/players.js';
import type { NightActionRow } from '../db/nightActions.js';

// Prevent real DB usage
vi.mock('../db/client.js', () => ({
  pool: { query: vi.fn() },
}));

const getGameMock = vi.fn();
const getPlayersForGameMock = vi.fn();
const getNightActionsForNightMock = vi.fn();
const advancePhaseMock = vi.fn();
const markPlayerDeadMock = vi.fn(
  async (_gameId: string, _userId: string) => {},
);
const endGameMock = vi.fn();
const getLoversMock = vi.fn(async () => null);

vi.mock('../db.js', () => ({
  getGame: getGameMock,
  getPlayersForGame: getPlayersForGameMock,
  getNightActionsForNight: getNightActionsForNightMock,
  markPlayerDead: markPlayerDeadMock,
  advancePhase: advancePhaseMock,
  endGame: endGameMock,
  getVotesForDay: vi.fn(),
  getPendingHunterShot: vi.fn(),
  resolveHunterShotRecord: vi.fn(),
  incrementWolfExtraKillsForNextNight: vi.fn(),
  clearWolfExtraKillsForNextNight: vi.fn(),
  getLovers: getLoversMock,
}));

const sentMessages: { channelId: string; content: string }[] = [];

const openDmChannelMock = vi.fn((userId: string) =>
  Promise.resolve(`dm:${userId}`),
);
const postChannelMessageMock = vi.fn(
  async (channelId: string, body: { content: string }) => {
    sentMessages.push({ channelId, content: body.content });
    return {};
  },
);

vi.mock('../utils.js', () => ({
  openDmChannel: openDmChannelMock,
  postChannelMessage: postChannelMessageMock,
  DiscordRequest: vi.fn(),
  patchChannelMessage: vi.fn(),
  sendDmMessage: vi.fn(),
}));

vi.mock('../jobs/dayVoting.js', () => ({
  scheduleDayVoting: vi.fn(),
  boss: { send: vi.fn(), work: vi.fn(), createQueue: vi.fn(), start: vi.fn() },
}));
vi.mock('../jobs/nightTimeout.js', () => ({
  scheduleNightTimeout: vi.fn(),
}));
vi.mock('../jobs/dayTimeout.js', () => ({
  scheduleDayTimeout: vi.fn(),
}));

const evaluateNightResolutionMock = vi.fn();

vi.mock('../game/engine/nightResolution.js', () => ({
  chooseKillVictim: (killTargets: string[]): string | null =>
    killTargets.length > 0 ? killTargets[0]! : null,
  evaluateNightResolution: evaluateNightResolutionMock,
}));

// Import after mocks
const { maybeResolveNight } = await import(
  '../game/engine/gameOrchestrator.js'
);

function makePlayer(partial: Partial<GamePlayerState>): GamePlayerState {
  return {
    user_id: 'u',
    role: 'villager',
    alignment: 'town',
    is_alive: true,
    ...partial,
  };
}

function makeAction(partial: Partial<NightActionRow>): NightActionRow {
  return {
    id: 1,
    game_id: 'g1',
    night: 1,
    actor_id: 'actor',
    target_id: null,
    action_kind: 'none',
    role: 'villager',
    created_at: Date.now(),
    ...partial,
  };
}

beforeEach(() => {
  sentMessages.length = 0;
  getGameMock.mockReset();
  getPlayersForGameMock.mockReset();
  getNightActionsForNightMock.mockReset();
  advancePhaseMock.mockReset();
  markPlayerDeadMock.mockReset();
  endGameMock.mockReset();
  evaluateNightResolutionMock.mockReset();
  openDmChannelMock.mockClear();
  postChannelMessageMock.mockClear();
  getLoversMock.mockReset();
});

describe('Serial Killer night actions', () => {
  it('kills a home target when not protected by the doctor', async () => {
    getGameMock.mockResolvedValue({
      id: 'g1',
      status: 'night',
      current_night: 1,
      current_day: 0,
      wolf_extra_kills_next_night: 0,
      channel_id: 'channel:g1',
    });

    const players: GamePlayerState[] = [
      makePlayer({
        user_id: 'sk',
        role: 'serial_killer',
        alignment: 'neutral',
      }),
      makePlayer({ user_id: 'v', role: 'villager', alignment: 'town' }),
    ];

    getPlayersForGameMock
      .mockResolvedValueOnce(players)
      .mockResolvedValueOnce(players);

    const actions: NightActionRow[] = [
      makeAction({
        id: 1,
        actor_id: 'sk',
        target_id: 'v',
        action_kind: 'murder',
        role: 'serial_killer',
      }),
    ];
    getNightActionsForNightMock.mockResolvedValue(actions);

    evaluateNightResolutionMock.mockReturnValue({
      state: 'ready',
      killTargets: [],
      protectTargets: [],
      visitActions: [],
    });

    advancePhaseMock.mockResolvedValue('day');

    await maybeResolveNight('g1');

    const killedIds = markPlayerDeadMock.mock.calls
      .map(([, id]) => id)
      .sort();
    expect(killedIds).toEqual(['v']);
  });

  it('cannot kill a home target who is protected by the doctor', async () => {
    getGameMock.mockResolvedValue({
      id: 'g1',
      status: 'night',
      current_night: 1,
      current_day: 0,
      wolf_extra_kills_next_night: 0,
      channel_id: 'channel:g1',
    });

    const players: GamePlayerState[] = [
      makePlayer({
        user_id: 'sk',
        role: 'serial_killer',
        alignment: 'neutral',
      }),
      makePlayer({ user_id: 'v', role: 'villager', alignment: 'town' }),
      makePlayer({ user_id: 'doc', role: 'doctor', alignment: 'town' }),
    ];

    getPlayersForGameMock
      .mockResolvedValueOnce(players)
      .mockResolvedValueOnce(players);

    const actions: NightActionRow[] = [
      // Serial Killer targets v
      makeAction({
        id: 1,
        actor_id: 'sk',
        target_id: 'v',
        action_kind: 'murder',
        role: 'serial_killer',
      }),
      // Doctor protects v at home
      makeAction({
        id: 2,
        actor_id: 'doc',
        target_id: 'v',
        action_kind: 'protect',
        role: 'doctor',
      }),
    ];
    getNightActionsForNightMock.mockResolvedValue(actions);

    evaluateNightResolutionMock.mockReturnValue({
      state: 'ready',
      killTargets: [],
      protectTargets: ['v'],
      visitActions: [],
    });

    advancePhaseMock.mockResolvedValue('day');

    await maybeResolveNight('g1');

    const killedIds = markPlayerDeadMock.mock.calls
      .map(([, id]) => id)
      .sort();
    expect(killedIds).toEqual([]);

    // Doctor saved target should receive a DM and the Serial Killer
    // should be told their kill was blocked.
    const dmByChannel = new Map(sentMessages.map((m) => [m.channelId, m.content]));
    const skDm = dmByChannel.get('dm:sk');
    const victimDm = dmByChannel.get('dm:v');

    expect(skDm).toBeDefined();
    if (skDm) {
      expect(skDm.toLowerCase()).toMatch(/doctor/);
    }
    expect(victimDm).toBeDefined();
    if (victimDm) {
      expect(victimDm.toLowerCase()).toMatch(/doctor/);
    }
  });
});
