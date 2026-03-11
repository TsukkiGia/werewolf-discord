import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock DB client so db.js barrel imports don't require a real DATABASE_URL.
vi.mock('../db/client.js', () => ({
  pool: { query: vi.fn() },
}));

const getGameMock = vi.fn();
const getPlayersForGameMock = vi.fn();
const recordNightActionMock = vi.fn(async () => true);
const recordLoversMock = vi.fn(async () => {});
const hasNightActionMock = vi.fn(async () => false);
const hasDayVoteMock = vi.fn(async () => false);

vi.mock('../db.js', () => ({
  getGame: getGameMock,
  addPlayer: vi.fn(),
  getPlayersForGame: getPlayersForGameMock,
  recordNightAction: recordNightActionMock,
  recordDayVote: vi.fn(),
  hasNightAction: hasNightActionMock,
  hasDayVote: hasDayVoteMock,
  recordLovers: recordLoversMock,
}));

const sendDmMessageMock = vi.fn(async () => {});

vi.mock('../utils.js', () => ({
  postChannelMessage: vi.fn(async () => ({ json: async () => ({ id: 'msg1' }) })),
  sendDmMessage: sendDmMessageMock,
  DiscordRequest: vi.fn(),
  patchChannelMessage: vi.fn(),
}));

vi.mock('../logging.js', () => ({
  logEvent: vi.fn(),
}));

const getInteractionUserIdMock = vi.fn<string | null, [Request]>();

vi.mock('../interactionHelpers.js', () => ({
  getInteractionUserId: (req: Request) => getInteractionUserIdMock(req),
}));

const maybeResolveNightMock = vi.fn(async () => {});

vi.mock('../game/engine/gameOrchestrator.js', () => ({
  maybeResolveNight: maybeResolveNightMock,
  maybeResolveDay: vi.fn(),
  resolveHunterShot: vi.fn(),
}));

// Minimal role registry stub so handlers/components can import it without caring
// about the specific role behavior for these tests.
vi.mock('../game/balancing/roleRegistry.js', () => ({
  ROLE_REGISTRY: {},
  isRoleName: (_value: unknown): _value is never => false,
}));

const {
  handleCupidFirstPick,
  handleCupidSecondPick,
} = await import('../handlers/components.js');

function makeReq(values: string[]): Request {
  return { body: { data: { values } } } as unknown as Request;
}

function makeRes() {
  let sent: unknown;
  const send = vi.fn((data: unknown) => {
    sent = data;
    return undefined;
  });
  const status = vi.fn((_code: number) => ({
    json: (obj: unknown) => {
      sent = obj;
      return undefined;
    },
  }));

  return {
    res: { send, status } as unknown as Response,
    getSent: () => sent,
    send,
  };
}

beforeEach(() => {
  getGameMock.mockReset();
  getPlayersForGameMock.mockReset();
  recordNightActionMock.mockReset();
  recordLoversMock.mockReset();
  hasNightActionMock.mockReset();
  sendDmMessageMock.mockReset();
  maybeResolveNightMock.mockReset();
  getInteractionUserIdMock.mockReset();
});

describe('Cupid component handlers', () => {
  it('cupid first pick prompts for second lover with filtered options', async () => {
    getGameMock.mockResolvedValue({
      id: 'g1',
      status: 'night',
      current_night: 1,
    });
    getPlayersForGameMock.mockResolvedValue([
      { user_id: 'cupid', role: 'cupid', alignment: 'town', is_alive: true },
      { user_id: 'a', role: 'villager', alignment: 'town', is_alive: true },
      { user_id: 'b', role: 'villager', alignment: 'town', is_alive: true },
    ]);
    getInteractionUserIdMock.mockReturnValue('cupid');

    const { res, getSent } = makeRes();
    const req = makeReq(['a']);

    await handleCupidFirstPick(req, res, 'cupid_link1:g1');

    const payload = getSent() as {
      data: { components: Array<{ type: number; components?: unknown[] }> };
    };
    expect(payload).toBeDefined();

    const actionRow = payload.data.components[1];
    const select = (actionRow as any).components[0];
    expect(select.custom_id).toBe('cupid_link2:g1:a');
    const optionValues = (select.options as Array<{ value: string }>).map(
      (o) => o.value,
    );
    expect(optionValues).toEqual(['b']); // excludes cupid and first pick
  });

  it('cupid second pick records lovers, night action, DMs both lovers, and triggers resolution', async () => {
    getGameMock.mockResolvedValue({
      id: 'g1',
      status: 'night',
      current_night: 1,
    });
    getPlayersForGameMock.mockResolvedValue([
      { user_id: 'cupid', role: 'cupid', alignment: 'town', is_alive: true },
      { user_id: 'a', role: 'villager', alignment: 'town', is_alive: true },
      { user_id: 'b', role: 'villager', alignment: 'town', is_alive: true },
    ]);
    getInteractionUserIdMock.mockReturnValue('cupid');

    const { res, getSent } = makeRes();
    const req = makeReq(['b']);

    await handleCupidSecondPick(req, res, 'cupid_link2:g1:a');

    expect(recordLoversMock).toHaveBeenCalledWith({
      gameId: 'g1',
      loverAId: 'a',
      loverBId: 'b',
    });
    expect(recordNightActionMock).toHaveBeenCalledWith({
      gameId: 'g1',
      night: 1,
      actorId: 'cupid',
      targetId: 'b',
      actionKind: 'link',
      role: 'cupid',
    });

    // Cupid should DM both Lovers.
    const dmTargets = sendDmMessageMock.mock.calls.map((c) => c[0]);
    expect(dmTargets.sort()).toEqual(['a', 'b']);

    // Night resolution should be re-checked.
    expect(maybeResolveNightMock).toHaveBeenCalledWith('g1');

    const payload = getSent() as {
      data: { components: Array<{ type: number; content?: string }> };
    };
    const textComponent = payload.data.components[0] as { content: string };
    expect(textComponent.content).toContain('<@a>');
    expect(textComponent.content).toContain('<@b>');
  });
});
