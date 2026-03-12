import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GamePlayerState } from '../db/players.js';
import type { NightActionRow } from '../db/nightActions.js';
import type { HarlotVisit } from '../game/engine/nightResolution.js';

// Mock DB client so importing DB helpers doesn't require a real DATABASE_URL
vi.mock('../db/client.js', () => ({
  pool: { query: vi.fn() },
}));

// Capture outgoing DMs without hitting Discord
const sentMessages: { channelId: string; content: string }[] = [];

const openDmChannelMock = vi.fn((userId: string) =>
  Promise.resolve(`dm:${userId}`),
);
const postChannelMessageMock = vi.fn(
  (channelId: string, body: { content: string }) => {
    sentMessages.push({ channelId, content: body.content });
    return Promise.resolve();
  },
);

vi.mock('../utils.js', () => ({
  openDmChannel: openDmChannelMock,
  postChannelMessage: postChannelMessageMock,
}));

// Track deaths without touching the real DB
const markPlayerDeadMock = vi.fn(
  (_gameId: string, _userId: string) => Promise.resolve(),
);

vi.mock('../db/players.js', () => ({
  markPlayerDead: markPlayerDeadMock,
}));

// Arsonist DB helpers
const getDousedTargetsMock = vi.fn(
  async (_gameId: string): Promise<string[]> => [],
);
const addDousedTargetMock = vi.fn(
  (_gameId: string, _targetId: string) => Promise.resolve(),
);
const clearDousedTargetsMock = vi.fn(
  (_gameId: string) => Promise.resolve(),
);

vi.mock('../db/arsonist.js', () => ({
  getDousedTargets: getDousedTargetsMock,
  addDousedTarget: addDousedTargetMock,
  clearDousedTargets: clearDousedTargetsMock,
}));

// Harlot narration helpers — keep them simple and observable
const harlotVisitedWolfLineMock = vi.fn(
  (targetId: string) => `visited wolf ${targetId}`,
);
const harlotVisitedTargetLineMock = vi.fn(
  (targetId: string) => `visited victim ${targetId}`,
);
const harlotSafeVisitLineMock = vi.fn(
  (targetId: string) => `safe visit ${targetId}`,
);
const harlotVisitNotificationLineMock = vi.fn(
  () => `someone slipped into your bed`,
);

vi.mock('../game/strings/narration.js', () => ({
  harlotVisitedWolfLine: harlotVisitedWolfLineMock,
  harlotVisitedTargetLine: harlotVisitedTargetLineMock,
  harlotSafeVisitLine: harlotSafeVisitLineMock,
  harlotVisitNotificationLine: harlotVisitNotificationLineMock,
}));

// Import after mocks so the module picks them up
const {
  buildAwayPlayerIds,
  processDoctorActions,
  processHarlotActions,
  processChemistActions,
  processArsonistActions,
} = await import('../game/engine/nightActionProcessors.js');

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
    game_id: 'g',
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
  markPlayerDeadMock.mockClear();
  openDmChannelMock.mockClear();
  postChannelMessageMock.mockClear();
  getDousedTargetsMock.mockClear();
  addDousedTargetMock.mockClear();
  clearDousedTargetsMock.mockClear();
  harlotVisitedWolfLineMock.mockClear();
  harlotVisitedTargetLineMock.mockClear();
  harlotSafeVisitLineMock.mockClear();
  harlotVisitNotificationLineMock.mockClear();
});

describe('buildAwayPlayerIds', () => {
  it('collects actors for visit/kill/potion actions with targets (protect does not make doctor away)', () => {
    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'visitor',
        action_kind: 'visit',
        target_id: 't1',
      }),
      makeAction({
        actor_id: 'killer',
        action_kind: 'kill',
        target_id: 't2',
      }),
      makeAction({
        actor_id: 'chemist',
        action_kind: 'potion',
        target_id: 't3',
      }),
      makeAction({
        actor_id: 'doctor',
        action_kind: 'protect',
        target_id: 't4',
      }),
      // Should not count — no target
      makeAction({
        actor_id: 'noTarget',
        action_kind: 'visit',
        target_id: null,
      }),
      // Should not count — inspect is not an "away" action
      makeAction({
        actor_id: 'seer',
        action_kind: 'inspect',
        target_id: 't5',
      }),
    ];

    const away = buildAwayPlayerIds(actions);
    expect(Array.from(away).sort()).toEqual(
      ['visitor', 'killer', 'chemist'].sort(),
    );
    expect(away.has('doctor')).toBe(false);
    expect(away.has('seer')).toBe(false);
    expect(away.has('noTarget')).toBe(false);
  });
});

describe('processDoctorActions', () => {
  it('marks a target as saved when wolves attacked them', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'doc', role: 'doctor' }),
      makePlayer({ user_id: 'v1', role: 'villager' }),
    ];

    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'doc',
        target_id: 'v1',
        action_kind: 'protect',
        role: 'doctor',
      }),
    ];

    const res = await processDoctorActions(players, actions, ['v1'], []);

    expect(res.anySaved).toBe(true);
    expect(res.killedDoctorId).toBeNull();
    expect(res.doctorDeathInfo).toBeNull();
    expect(markPlayerDeadMock).not.toHaveBeenCalled();

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.channelId).toBe('dm:doc');
    expect(sentMessages[0]!.content).toContain('wolves struck');
  });

  it('tells the doctor when their target was out for the night', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'doc', role: 'doctor' }),
      makePlayer({ user_id: 'v1', role: 'villager' }),
    ];

    const actions: NightActionRow[] = [
      // Target is out visiting someone else
      makeAction({
        actor_id: 'v1',
        target_id: 'other',
        action_kind: 'visit',
        role: 'harlot',
      }),
      makeAction({
        actor_id: 'doc',
        target_id: 'v1',
        action_kind: 'protect',
        role: 'doctor',
      }),
    ];

    const res = await processDoctorActions(players, actions, [], []);

    expect(res.anySaved).toBe(false);
    expect(res.killedDoctorId).toBeNull();
    expect(markPlayerDeadMock).not.toHaveBeenCalled();

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.content).toContain('out for the night');
  });

  it('kills the doctor when protecting a wolf and the retaliation roll succeeds', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'doc', role: 'doctor', alignment: 'town' }),
      makePlayer({
        user_id: 'wolf',
        role: 'werewolf',
        alignment: 'wolf',
      }),
    ];

    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'doc',
        target_id: 'wolf',
        action_kind: 'protect',
        role: 'doctor',
      }),
    ];

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.3); // < 0.75 -> doctor dies
    try {
      const res = await processDoctorActions(players, actions, [], []);

      expect(markPlayerDeadMock).toHaveBeenCalledWith('g', 'doc');
      expect(res.killedDoctorId).toBe('doc');
      expect(res.doctorDeathInfo).toEqual({
        doctorId: 'doc',
        wolfTargetId: 'wolf',
      });

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]!.content).toContain('wolf in disguise');
      expect(sentMessages[0]!.content).toContain('did not survive');
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('spares the doctor when the retaliation roll fails', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'doc', role: 'doctor', alignment: 'town' }),
      makePlayer({
        user_id: 'wolf',
        role: 'werewolf',
        alignment: 'wolf',
      }),
    ];

    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'doc',
        target_id: 'wolf',
        action_kind: 'protect',
        role: 'doctor',
      }),
    ];

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9); // >= 0.75 -> doctor lives
    try {
      const res = await processDoctorActions(players, actions, [], []);

      expect(markPlayerDeadMock).not.toHaveBeenCalled();
      expect(res.killedDoctorId).toBeNull();
      // No doctorDeathInfo should be recorded when the doctor survives;
      // that struct is only used to build dawn death narration.
      expect(res.doctorDeathInfo).toBeNull();

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]!.content).toContain('wolf in disguise');
      expect(sentMessages[0]!.content).toContain('escaped with your life');
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('skips retaliation entirely if the doctor was already killed earlier in the night', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'doc', role: 'doctor', alignment: 'town' }),
      makePlayer({
        user_id: 'wolf',
        role: 'werewolf',
        alignment: 'wolf',
      }),
    ];

    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'doc',
        target_id: 'wolf',
        action_kind: 'protect',
        role: 'doctor',
      }),
    ];

    const res = await processDoctorActions(players, actions, [], ['doc']);

    expect(markPlayerDeadMock).not.toHaveBeenCalled();
    expect(res.killedDoctorId).toBeNull();
    expect(res.doctorDeathInfo).toBeNull();
    expect(sentMessages).toHaveLength(0);
  });
});

describe('processHarlotActions', () => {
  it('kills the harlot when visiting a wolf-core role', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'h', role: 'harlot', alignment: 'town' }),
      makePlayer({ user_id: 'w', role: 'werewolf', alignment: 'wolf' }),
    ];

    const visits: HarlotVisit[] = [{ harlotId: 'h', targetId: 'w' }];

    const res = await processHarlotActions(players, visits, [], 'g', new Set());

    expect(markPlayerDeadMock).toHaveBeenCalledWith('g', 'h');
    expect(res.killedHarlotIds).toEqual(['h']);
    expect(res.harlotDeathInfos).toEqual([
      { harlotId: 'h', targetId: 'w', cause: 'visited_wolf' },
    ]);

    expect(harlotVisitedWolfLineMock).toHaveBeenCalledWith('w');

    // Only the harlot should get a DM on a lethal visit
    expect(sentMessages.map((m) => m.channelId)).toEqual(['dm:h']);
  });

  it('kills the harlot when visiting the wolves’ chosen victim', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'h', role: 'harlot', alignment: 'town' }),
      makePlayer({ user_id: 'v', role: 'villager', alignment: 'town' }),
    ];

    const visits: HarlotVisit[] = [{ harlotId: 'h', targetId: 'v' }];

    const res = await processHarlotActions(players, visits, ['v'], 'g', new Set());

    expect(markPlayerDeadMock).toHaveBeenCalledWith('g', 'h');
    expect(res.killedHarlotIds).toEqual(['h']);
    expect(res.harlotDeathInfos).toEqual([
      { harlotId: 'h', targetId: 'v', cause: 'visited_victim' },
    ]);

    expect(harlotVisitedTargetLineMock).toHaveBeenCalledWith('v');
    expect(sentMessages.map((m) => m.channelId)).toEqual(['dm:h']);
  });

  it('sends safe-visit DMs when visiting a non-wolf, non-victim', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'h', role: 'harlot', alignment: 'town' }),
      makePlayer({ user_id: 'v', role: 'villager', alignment: 'town' }),
    ];

    const visits: HarlotVisit[] = [{ harlotId: 'h', targetId: 'v' }];

    const res = await processHarlotActions(players, visits, [], 'g', new Set());

    expect(res.killedHarlotIds).toEqual([]);
    expect(res.harlotDeathInfos).toEqual([]);
    expect(markPlayerDeadMock).not.toHaveBeenCalled();

    expect(harlotSafeVisitLineMock).toHaveBeenCalledWith('v');
    expect(harlotVisitNotificationLineMock).toHaveBeenCalled();

    const channels = sentMessages.map((m) => m.channelId).sort();
    expect(channels).toEqual(['dm:h', 'dm:v']);
  });

  it('treats visiting a wolf who is out for the night as a safe visit', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'h', role: 'harlot', alignment: 'town' }),
      makePlayer({ user_id: 'w', role: 'werewolf', alignment: 'wolf' }),
    ];

    const visits: HarlotVisit[] = [{ harlotId: 'h', targetId: 'w' }];

    // Mark the wolf as "away" (e.g., out hunting) so the harlot finds an empty house.
    const awayIds = new Set<string>(['w']);

    const res = await processHarlotActions(players, visits, [], 'g', awayIds);

    expect(res.killedHarlotIds).toEqual([]);
    expect(res.harlotDeathInfos).toEqual([]);
    expect(markPlayerDeadMock).not.toHaveBeenCalled();

    expect(harlotSafeVisitLineMock).toHaveBeenCalledWith('w');
    expect(harlotVisitNotificationLineMock).toHaveBeenCalled();

    const channels = sentMessages.map((m) => m.channelId).sort();
    expect(channels).toEqual(['dm:h', 'dm:w']);
  });
});

describe('processChemistActions', () => {
  it('returns early when there are no chemists', async () => {
    const players: GamePlayerState[] = [makePlayer({ user_id: 'v' })];
    const actions: NightActionRow[] = [];

    const res = await processChemistActions(players, actions, 1, 'g', []);

    expect(res.killedIds).toEqual([]);
    expect(res.duels).toEqual([]);
    expect(markPlayerDeadMock).not.toHaveBeenCalled();
  });

  it('skips chemist duel if the chemist was already killed earlier that night', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'chem', role: 'chemist', alignment: 'town' }),
      makePlayer({ user_id: 't', role: 'villager', alignment: 'town' }),
    ];

    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'chem',
        target_id: 't',
        action_kind: 'potion',
        role: 'chemist',
      }),
    ];

    const res = await processChemistActions(players, actions, 1, 'g', ['chem']);

    expect(res.killedIds).toEqual([]);
    expect(res.duels).toEqual([]);
    expect(markPlayerDeadMock).not.toHaveBeenCalled();
    expect(sentMessages).toHaveLength(0);
  });

  it('does not resolve a duel when the target is away from home', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'chem', role: 'chemist', alignment: 'town' }),
      makePlayer({ user_id: 't', role: 'villager', alignment: 'town' }),
      makePlayer({ user_id: 'other', role: 'villager', alignment: 'town' }),
    ];

    const actions: NightActionRow[] = [
      // Target is out visiting someone else
      makeAction({
        actor_id: 't',
        target_id: 'other',
        action_kind: 'visit',
        role: 'harlot',
      }),
      // Chemist attempts to duel that target
      makeAction({
        actor_id: 'chem',
        target_id: 't',
        action_kind: 'potion',
        role: 'chemist',
      }),
    ];

    const res = await processChemistActions(players, actions, 1, 'g', []);

    expect(res.killedIds).toEqual([]);
    expect(res.duels).toEqual([]);
    expect(markPlayerDeadMock).not.toHaveBeenCalled();

    // Chemist should get a DM explaining the target was out for the night.
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.channelId).toBe('dm:chem');
    expect(sentMessages[0]!.content).toContain('out for the night');
  });

  it('kills the chemist when the duel roll chooses them', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'chem', role: 'chemist', alignment: 'town' }),
      makePlayer({ user_id: 't', role: 'villager', alignment: 'town' }),
    ];

    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'chem',
        target_id: 't',
        action_kind: 'potion',
        role: 'chemist',
      }),
    ];

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.3); // < 0.5 -> chemist dies
    try {
      const res = await processChemistActions(players, actions, 1, 'g', []);

      expect(markPlayerDeadMock).toHaveBeenCalledWith('g', 'chem');
      expect(res.killedIds).toEqual(['chem']);
      expect(res.duels).toEqual([
        { chemistId: 'chem', targetId: 't', victimId: 'chem' },
      ]);

      const channels = sentMessages.map((m) => m.channelId).sort();
      expect(channels).toEqual(['dm:chem', 'dm:t']);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('kills the target when the duel roll chooses them', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'chem', role: 'chemist', alignment: 'town' }),
      makePlayer({ user_id: 't', role: 'villager', alignment: 'town' }),
    ];

    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'chem',
        target_id: 't',
        action_kind: 'potion',
        role: 'chemist',
      }),
    ];

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8); // >= 0.5 -> target dies
    try {
      const res = await processChemistActions(players, actions, 1, 'g', []);

      expect(markPlayerDeadMock).toHaveBeenCalledWith('g', 't');
      expect(res.killedIds).toEqual(['t']);
      expect(res.duels).toEqual([
        { chemistId: 'chem', targetId: 't', victimId: 't' },
      ]);

      const channels = sentMessages.map((m) => m.channelId).sort();
      expect(channels).toEqual(['dm:chem', 'dm:t']);
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe('processArsonistActions', () => {
  it('returns early when there is no alive arsonist', async () => {
    const players: GamePlayerState[] = [makePlayer({ user_id: 'v' })];
    const actions: NightActionRow[] = [];

    const res = await processArsonistActions('g', players, actions, []);

    expect(res).toEqual({ killedIds: [], burnedVictims: [] });
    expect(getDousedTargetsMock).not.toHaveBeenCalled();
    expect(addDousedTargetMock).not.toHaveBeenCalled();
  });

  it('records a douse without killing anyone', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'a', role: 'arsonist', alignment: 'neutral' }),
      makePlayer({ user_id: 'v', role: 'villager', alignment: 'town' }),
    ];

    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'a',
        target_id: 'v',
        action_kind: 'potion',
        role: 'arsonist',
      }),
    ];

    const res = await processArsonistActions('g', players, actions, []);

    expect(addDousedTargetMock).toHaveBeenCalledWith('g', 'v');
    expect(clearDousedTargetsMock).not.toHaveBeenCalled();
    expect(markPlayerDeadMock).not.toHaveBeenCalled();

    expect(res.killedIds).toEqual([]);
    expect(res.burnedVictims).toEqual([]);

    // Arsonist gets a DM about the douse
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.channelId).toBe('dm:a');
  });

  it('ignites doused houses and kills occupants plus visitors with correct kinds', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'a', role: 'arsonist', alignment: 'neutral' }),
      makePlayer({ user_id: 'home', role: 'villager', alignment: 'town' }),
      makePlayer({ user_id: 'away', role: 'villager', alignment: 'town' }),
      makePlayer({ user_id: 'doc', role: 'doctor', alignment: 'town' }),
    ];

    const actions: NightActionRow[] = [
      // Arsonist chooses to ignite
      makeAction({
        actor_id: 'a',
        target_id: null,
        action_kind: 'ignite',
        role: 'arsonist',
      }),
      // Away occupant is out visiting someone else
      makeAction({
        actor_id: 'away',
        target_id: 'someone',
        action_kind: 'visit',
        role: 'harlot',
      }),
      // Doctor is visiting "home" house
      makeAction({
        actor_id: 'doc',
        target_id: 'home',
        action_kind: 'protect',
        role: 'doctor',
      }),
    ];

    getDousedTargetsMock.mockResolvedValue(['home', 'away']);

    const res = await processArsonistActions('g', players, actions, []);

    expect(getDousedTargetsMock).toHaveBeenCalledWith('g');
    expect(clearDousedTargetsMock).toHaveBeenCalledWith('g');

    // Occupants (home + away) and the visiting doctor should all die
    const killedSorted = res.killedIds.slice().sort();
    expect(killedSorted).toEqual(['away', 'doc', 'home'].sort());

    const kinds = new Map(res.burnedVictims.map((v) => [v.victimId, v.kind]));
    expect(kinds.get('home')).toBe('occupant_home');
    expect(kinds.get('away')).toBe('occupant_away');
    expect(kinds.get('doc')).toBe('visitor');

    expect(markPlayerDeadMock).toHaveBeenCalledTimes(3);
  });

  it('does nothing on ignite when there are no doused houses', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'a', role: 'arsonist', alignment: 'neutral' }),
    ];

    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'a',
        target_id: null,
        action_kind: 'ignite',
        role: 'arsonist',
      }),
    ];

    getDousedTargetsMock.mockResolvedValue([]);

    const res = await processArsonistActions('g', players, actions, []);

    expect(res.killedIds).toEqual([]);
    expect(res.burnedVictims).toEqual([]);
    expect(markPlayerDeadMock).not.toHaveBeenCalled();
    expect(clearDousedTargetsMock).not.toHaveBeenCalled();
  });
});
