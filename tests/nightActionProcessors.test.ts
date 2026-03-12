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

// Track deaths and role changes without touching the real DB
const markPlayerDeadMock = vi.fn(
  (_gameId: string, _userId: string) => Promise.resolve(),
);
const setPlayerRoleAndAlignmentMock = vi.fn(
  (_gameId: string, _userId: string, _role: string, _alignment: string) =>
    Promise.resolve(),
);

vi.mock('../db/players.js', () => ({
  markPlayerDead: markPlayerDeadMock,
  setPlayerRoleAndAlignment: setPlayerRoleAndAlignmentMock,
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

// Cult DB helpers
const addCultMemberMock = vi.fn(
  (_gameId: string, _userId: string) => Promise.resolve(),
);
const getCultMemberIdsMock = vi.fn(
  async (_gameId: string): Promise<string[]> => [],
);
const getNewestCultMemberIdMock = vi.fn(
  async (_gameId: string): Promise<string | null> => null,
);

vi.mock('../db/cult.js', () => ({
  addCultMember: addCultMemberMock,
  getCultMemberIds: getCultMemberIdsMock,
  getNewestCultMemberId: getNewestCultMemberIdMock,
}));

// Use real narration strings; only replace harlot functions with observable mocks
// so we can assert which variant was called in harlot tests.
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

vi.mock('../game/strings/narration.js', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../game/strings/narration.js');
  return {
    ...actual,
    harlotVisitedWolfLine: harlotVisitedWolfLineMock,
    harlotVisitedTargetLine: harlotVisitedTargetLineMock,
    harlotSafeVisitLine: harlotSafeVisitLineMock,
    harlotVisitNotificationLine: harlotVisitNotificationLineMock,
  };
});

// Import after mocks so the module picks them up
const {
  buildAwayPlayerIds,
  processDoctorActions,
  processHarlotActions,
  processChemistActions,
  processArsonistActions,
  processCultistActions,
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
  setPlayerRoleAndAlignmentMock.mockClear();
  openDmChannelMock.mockClear();
  postChannelMessageMock.mockClear();
  getDousedTargetsMock.mockClear();
  addDousedTargetMock.mockClear();
  clearDousedTargetsMock.mockClear();
  addCultMemberMock.mockClear();
  getCultMemberIdsMock.mockClear();
  getNewestCultMemberIdMock.mockClear();
  harlotVisitedWolfLineMock.mockClear();
  harlotVisitedTargetLineMock.mockClear();
  harlotSafeVisitLineMock.mockClear();
  harlotVisitNotificationLineMock.mockClear();
});

describe('buildAwayPlayerIds', () => {
  it('treats only visiting actors as away (protect/kill/potion do not make actors away)', () => {
    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'visitor',
        action_kind: 'visit',
        target_id: 't1',
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
    expect(Array.from(away).sort()).toEqual(['visitor']);
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
    expect(sentMessages[0]!.content).toContain('night passed quietly');
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

      // Math.random is mocked to 0.9; pickRandom([...3 variants...]) picks index 2
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]!.content).toContain('found fangs');
      expect(sentMessages[0]!.content).toContain('survived');
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

    const res = await processHarlotActions(players, visits, [], [], 'g');

    expect(markPlayerDeadMock).toHaveBeenCalledWith('g', 'h');
    expect(res.killedHarlotIds).toEqual(['h']);
    expect(res.harlotDeathInfos).toEqual([
      { harlotId: 'h', targetId: 'w', cause: 'visited_wolf' },
    ]);

    expect(harlotVisitedWolfLineMock).toHaveBeenCalledWith('w');

    // Only the harlot should get a DM on a lethal visit
    expect(sentMessages.map((m) => m.channelId)).toEqual(['dm:h']);
  });

  it("kills the harlot when visiting the wolves' chosen victim", async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'h', role: 'harlot', alignment: 'town' }),
      makePlayer({ user_id: 'v', role: 'villager', alignment: 'town' }),
    ];

    const visits: HarlotVisit[] = [{ harlotId: 'h', targetId: 'v' }];

    const res = await processHarlotActions(players, visits, ['v'], [], 'g');

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

    const res = await processHarlotActions(players, visits, [], [], 'g');

    expect(res.killedHarlotIds).toEqual([]);
    expect(res.harlotDeathInfos).toEqual([]);
    expect(markPlayerDeadMock).not.toHaveBeenCalled();

    expect(harlotSafeVisitLineMock).toHaveBeenCalledWith('v');
    expect(harlotVisitNotificationLineMock).toHaveBeenCalled();

    const channels = sentMessages.map((m) => m.channelId).sort();
    expect(channels).toEqual(['dm:h', 'dm:v']);
  });

  it('kills the harlot when visiting a wolf-core player regardless of whether the wolf is away', async () => {
    // The harlot processor checks role, not physical location — visiting a wolf is
    // always fatal for the harlot even if the wolf is away that night.
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'h', role: 'harlot', alignment: 'town' }),
      makePlayer({ user_id: 'w', role: 'werewolf', alignment: 'wolf' }),
    ];

    const visits: HarlotVisit[] = [{ harlotId: 'h', targetId: 'w' }];

    const res = await processHarlotActions(players, visits, [], [], 'g');

    expect(markPlayerDeadMock).toHaveBeenCalledWith('g', 'h');
    expect(res.killedHarlotIds).toEqual(['h']);
    expect(res.harlotDeathInfos).toEqual([
      { harlotId: 'h', targetId: 'w', cause: 'visited_wolf' },
    ]);

    expect(harlotVisitedWolfLineMock).toHaveBeenCalledWith('w');
    expect(sentMessages.map((m) => m.channelId)).toEqual(['dm:h']);
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

  it('skips chemist duel if the target was already killed earlier that night', async () => {
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

    // Target was killed earlier (e.g. by wolves) — no duel, no death narration
    const res = await processChemistActions(players, actions, 1, 'g', ['t']);

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

describe('processCultistActions', () => {
  it('returns no conversion when there are no alive cultists', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'v', role: 'villager' }),
    ];

    const res = await processCultistActions('g', players, [], []);

    expect(res.converted).toBe(false);
    expect(res.backfiredVictimId).toBeNull();
    expect(markPlayerDeadMock).not.toHaveBeenCalled();
  });

  it('fails silently when the plurality target was already killed earlier that night', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'cult', role: 'cultist', alignment: 'cult' }),
      makePlayer({ user_id: 'target', role: 'villager', alignment: 'town' }),
    ];

    const actions: NightActionRow[] = [
      makeAction({
        actor_id: 'cult',
        target_id: 'target',
        action_kind: 'convert',
        role: 'cultist',
      }),
    ];

    // Target was killed before cult acted (e.g. by wolves, chemist, or arsonist)
    const res = await processCultistActions('g', players, actions, ['target']);

    expect(res.converted).toBe(false);
    expect(res.backfiredVictimId).toBeNull();
    expect(res.backfireTargetId).toBeNull();
    expect(markPlayerDeadMock).not.toHaveBeenCalled();
    expect(sentMessages).toHaveLength(0);
  });

  it('fails silently on a tie (no plurality target)', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'cult1', role: 'cultist', alignment: 'cult' }),
      makePlayer({ user_id: 'cult2', role: 'cultist', alignment: 'cult' }),
      makePlayer({ user_id: 'v1', role: 'villager', alignment: 'town' }),
      makePlayer({ user_id: 'v2', role: 'villager', alignment: 'town' }),
    ];

    const actions: NightActionRow[] = [
      makeAction({ actor_id: 'cult1', target_id: 'v1', action_kind: 'convert', role: 'cultist' }),
      makeAction({ actor_id: 'cult2', target_id: 'v2', action_kind: 'convert', role: 'cultist' }),
    ];

    const res = await processCultistActions('g', players, actions, []);

    expect(res.converted).toBe(false);
    expect(res.backfiredVictimId).toBeNull();
    expect(markPlayerDeadMock).not.toHaveBeenCalled();
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

  it('ignites doused houses: kills occupants with correct kinds; non-visit actions are not collateral', async () => {
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
      // 'away' occupant is out visiting someone else
      makeAction({
        actor_id: 'away',
        target_id: 'someone',
        action_kind: 'visit',
        role: 'harlot',
      }),
      // Doctor uses protect on 'home' — NOT a physical presence, should NOT burn
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

    // Only the two occupants die; doctor using protect does not count as physically present
    const killedSorted = res.killedIds.slice().sort();
    expect(killedSorted).toEqual(['away', 'home'].sort());

    const kinds = new Map(res.burnedVictims.map((v) => [v.victimId, v.kind]));
    expect(kinds.get('home')).toBe('occupant_home');
    expect(kinds.get('away')).toBe('occupant_away');
    expect(kinds.has('doc')).toBe(false);

    expect(markPlayerDeadMock).toHaveBeenCalledTimes(2);
  });

  it('harlot physically visiting a doused house on ignite night dies as collateral', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'a', role: 'arsonist', alignment: 'neutral' }),
      makePlayer({ user_id: 'target', role: 'villager', alignment: 'town' }),
      makePlayer({ user_id: 'harlot', role: 'harlot', alignment: 'town' }),
    ];

    const actions: NightActionRow[] = [
      makeAction({ actor_id: 'a', target_id: null, action_kind: 'ignite', role: 'arsonist' }),
      // Harlot visits the doused house — physically present
      makeAction({ actor_id: 'harlot', target_id: 'target', action_kind: 'visit', role: 'harlot' }),
    ];

    getDousedTargetsMock.mockResolvedValue(['target']);

    const res = await processArsonistActions('g', players, actions, []);

    const killedSorted = res.killedIds.slice().sort();
    expect(killedSorted).toEqual(['harlot', 'target'].sort());

    const kinds = new Map(res.burnedVictims.map((v) => [v.victimId, v.kind]));
    expect(kinds.get('target')).toBe('occupant_home');
    expect(kinds.get('harlot')).toBe('visitor');

    expect(markPlayerDeadMock).toHaveBeenCalledTimes(2);
  });

  it('thief steal and other non-visit actions on a doused house do not cause collateral deaths', async () => {
    const players: GamePlayerState[] = [
      makePlayer({ user_id: 'a', role: 'arsonist', alignment: 'neutral' }),
      makePlayer({ user_id: 'target', role: 'villager', alignment: 'town' }),
      makePlayer({ user_id: 'thief', role: 'thief', alignment: 'town' }),
      makePlayer({ user_id: 'cultist', role: 'cultist', alignment: 'cult' }),
      makePlayer({ user_id: 'hunter', role: 'cult_hunter', alignment: 'town' }),
    ];

    const actions: NightActionRow[] = [
      makeAction({ actor_id: 'a', target_id: null, action_kind: 'ignite', role: 'arsonist' }),
      // Thief steals from the doused house — figurative, not physical
      makeAction({ actor_id: 'thief', target_id: 'target', action_kind: 'steal', role: 'thief' }),
      // Cultist converts the doused target — not physical
      makeAction({ actor_id: 'cultist', target_id: 'target', action_kind: 'convert', role: 'cultist' }),
      // Cult hunter hunts the doused target — not physical
      makeAction({ actor_id: 'hunter', target_id: 'target', action_kind: 'hunt', role: 'cult_hunter' }),
    ];

    getDousedTargetsMock.mockResolvedValue(['target']);

    const res = await processArsonistActions('g', players, actions, []);

    // Only the doused target dies
    expect(res.killedIds).toEqual(['target']);
    expect(res.burnedVictims).toHaveLength(1);
    expect(res.burnedVictims[0]!.victimId).toBe('target');
    expect(res.burnedVictims[0]!.kind).toBe('occupant_home');

    expect(markPlayerDeadMock).toHaveBeenCalledTimes(1);
    expect(markPlayerDeadMock).toHaveBeenCalledWith('g', 'target');
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
