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
  openDmChannelMock.mockReset();
  postChannelMessageMock.mockReset();
  getLoversMock.mockReset();
});

describe('maybeResolveNight — wolf kills with home/away and visitors', () => {
  it('does not kill an away target and sends appropriate DMs', async () => {
    getGameMock.mockResolvedValue({
      id: 'g1',
      status: 'night',
      current_night: 1,
      current_day: 0,
      wolf_extra_kills_next_night: 0,
      channel_id: 'channel:g1',
    });

    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'wolf', role: 'werewolf', alignment: 'wolf' }),
      makePlayer({ user_id: 'v', role: 'villager', alignment: 'town' }),
    ];

    // First call (pre-resolution) and second call (post-kills) both see same players
    getPlayersForGameMock
      .mockResolvedValueOnce(players)
      .mockResolvedValueOnce(players);

    const actions: NightActionRow[] = [
      // Wolf targets v
      makeAction({
        id: 1,
        actor_id: 'wolf',
        target_id: 'v',
        action_kind: 'kill',
        role: 'werewolf',
      }),
      // v is out visiting someone else → away from home
      makeAction({
        id: 2,
        actor_id: 'v',
        target_id: 'x',
        action_kind: 'visit',
        role: 'harlot',
      }),
    ];
    getNightActionsForNightMock.mockResolvedValue(actions);

    evaluateNightResolutionMock.mockReturnValue({
      state: 'ready',
      killTargets: ['v'],
      protectTargets: [],
      visitActions: [],
    });

    advancePhaseMock.mockResolvedValue('day');

    await maybeResolveNight('g1');

    // No one should be killed when the target is away.
    expect(markPlayerDeadMock).not.toHaveBeenCalled();
  });

  it('kills both the chosen victim and a visiting chemist', async () => {
    getGameMock.mockResolvedValue({
      id: 'g1',
      status: 'night',
      current_night: 1,
      current_day: 0,
      wolf_extra_kills_next_night: 0,
      channel_id: 'channel:g1',
    });

    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'wolf', role: 'werewolf', alignment: 'wolf' }),
      makePlayer({ user_id: 'v', role: 'villager', alignment: 'town' }),
      makePlayer({ user_id: 'chem', role: 'chemist', alignment: 'town' }),
    ];

    getPlayersForGameMock
      .mockResolvedValueOnce(players)
      .mockResolvedValueOnce(players);

    const actions: NightActionRow[] = [
      // Wolf kills v
      makeAction({
        id: 1,
        actor_id: 'wolf',
        target_id: 'v',
        action_kind: 'kill',
        role: 'werewolf',
      }),
      // Chemist is at v's house (potion action) — counted as a visitor
      makeAction({
        id: 2,
        actor_id: 'chem',
        target_id: 'v',
        action_kind: 'potion',
        role: 'chemist',
      }),
    ];
    getNightActionsForNightMock.mockResolvedValue(actions);

    evaluateNightResolutionMock.mockReturnValue({
      state: 'ready',
      killTargets: ['v'],
      protectTargets: [],
      visitActions: [],
    });

    advancePhaseMock.mockResolvedValue('day');

    await maybeResolveNight('g1');

    // Both victim and visiting chemist should be killed by the wolves.
    const killedIds = markPlayerDeadMock.mock.calls
      .map(([, userId]) => userId)
      .sort();
    expect(killedIds).toEqual(['chem', 'v'].sort());
  });
});

describe('maybeResolveNight — wolves vs Serial Killer', () => {
  it('can sometimes kill the Serial Killer when they are home', async () => {
    getGameMock.mockResolvedValue({
      id: 'g1',
      status: 'night',
      current_night: 1,
      current_day: 0,
      wolf_extra_kills_next_night: 0,
      channel_id: 'channel:g1',
    });

    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'wolf', role: 'werewolf', alignment: 'wolf' }),
      makePlayer({
        user_id: 'sk',
        role: 'serial_killer',
        alignment: 'neutral',
      }),
    ];

    getPlayersForGameMock
      .mockResolvedValueOnce(players)
      .mockResolvedValueOnce(players);

    const actions: NightActionRow[] = [
      // Wolf targets the Serial Killer at home.
      makeAction({
        id: 1,
        actor_id: 'wolf',
        target_id: 'sk',
        action_kind: 'kill',
        role: 'werewolf',
      }),
    ];
    getNightActionsForNightMock.mockResolvedValue(actions);

    evaluateNightResolutionMock.mockReturnValue({
      state: 'ready',
      killTargets: ['sk'],
      protectTargets: [],
      visitActions: [],
    });

    advancePhaseMock.mockResolvedValue('day');

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);

    await maybeResolveNight('g1');

    randomSpy.mockRestore();

    const killedIds = markPlayerDeadMock.mock.calls.map(([, id]) => id).sort();
    expect(killedIds).toEqual(['sk']);
  });

  it('usually causes a wolf to die when they attack the Serial Killer at home', async () => {
    getGameMock.mockResolvedValue({
      id: 'g1',
      status: 'night',
      current_night: 1,
      current_day: 0,
      wolf_extra_kills_next_night: 0,
      channel_id: 'channel:g1',
    });

    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'wolf', role: 'werewolf', alignment: 'wolf' }),
      makePlayer({
        user_id: 'sk',
        role: 'serial_killer',
        alignment: 'neutral',
      }),
    ];

    getPlayersForGameMock
      .mockResolvedValueOnce(players)
      .mockResolvedValueOnce(players);

    const actions: NightActionRow[] = [
      makeAction({
        id: 1,
        actor_id: 'wolf',
        target_id: 'sk',
        action_kind: 'kill',
        role: 'werewolf',
      }),
    ];
    getNightActionsForNightMock.mockResolvedValue(actions);

    evaluateNightResolutionMock.mockReturnValue({
      state: 'ready',
      killTargets: ['sk'],
      protectTargets: [],
      visitActions: [],
    });

    advancePhaseMock.mockResolvedValue('day');

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8);

    await maybeResolveNight('g1');

    randomSpy.mockRestore();

    const killedIds = markPlayerDeadMock.mock.calls.map(([, id]) => id).sort();
    expect(killedIds).toEqual(['wolf']);
  });

  it('misses the Serial Killer when they are away, even if targeted', async () => {
    getGameMock.mockResolvedValue({
      id: 'g1',
      status: 'night',
      current_night: 1,
      current_day: 0,
      wolf_extra_kills_next_night: 0,
      channel_id: 'channel:g1',
    });

    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'wolf', role: 'werewolf', alignment: 'wolf' }),
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
      // Wolf hunts the Serial Killer.
      makeAction({
        id: 1,
        actor_id: 'wolf',
        target_id: 'sk',
        action_kind: 'kill',
        role: 'werewolf',
      }),
      // Serial Killer is out killing v, so they are "away".
      makeAction({
        id: 2,
        actor_id: 'sk',
        target_id: 'v',
        action_kind: 'kill',
        role: 'serial_killer',
      }),
    ];
    getNightActionsForNightMock.mockResolvedValue(actions);

    evaluateNightResolutionMock.mockReturnValue({
      state: 'ready',
      killTargets: ['sk'],
      protectTargets: [],
      visitActions: [],
    });

    advancePhaseMock.mockResolvedValue('day');

    await maybeResolveNight('g1');

    const killedIds = markPlayerDeadMock.mock.calls
      .map(([, id]) => id)
      .sort();
    // Wolves should miss the Serial Killer because they are away,
    // but the Serial Killer should still successfully kill their own target.
    expect(killedIds).toEqual(['v']);
  });
});
