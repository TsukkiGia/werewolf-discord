/**
 * Werewolf Simulation
 *
 * Runs a complete game with fake players and random actions, logging all
 * channel messages and personal DMs to console so you can audit role
 * interactions without needing real volunteers.
 *
 * Prerequisites:
 *   - DATABASE_URL set (uses your real dev DB; game data is cleaned up after)
 *   - Schema already applied (run the bot once or run initDb manually)
 *
 * Run with:
 *   npx vitest run sim/simulate.test.ts
 *
 * Or add to package.json scripts: "sim": "vitest run sim/simulate.test.ts"
 */

import 'dotenv/config';
import { afterAll, describe, expect, test, vi } from 'vitest';

// ─── Shared mutable state, defined before any vi.mock calls ──────────────────

const { captured, fakeResponse, playerNames } = vi.hoisted(() => {
  const channelMessages: Array<{ channelId: string; body: unknown }> = [];
  const dms: Array<{ userId: string; body: unknown }> = [];
  const captured = { channelMessages, dms };

  let msgId = 1000;
  const playerNames = new Map<string, string>();

  function fakeResponse(extra: Record<string, unknown> = {}) {
    const id = `sim-msg-${++msgId}`;
    return new Response(JSON.stringify({ id, ...extra }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return { captured, fakeResponse, playerNames };
});

// ─── Mock Discord API (captures all messages instead of sending them) ─────────

vi.mock('../utils.js', () => ({
  openDmChannel: vi.fn(async (userId: string) => `dm-${userId}`),

  postChannelMessage: vi.fn(async (channelId: string, body: unknown) => {
    if (channelId.startsWith('dm-')) {
      captured.dms.push({ userId: channelId.slice(3), body });
    } else {
      captured.channelMessages.push({ channelId, body });
    }
    return fakeResponse();
  }),

  sendDmMessage: vi.fn(async (userId: string, body: unknown) => {
    captured.dms.push({ userId, body });
    return fakeResponse();
  }),

  patchChannelMessage: vi.fn(async () => new Response('{}', { status: 200 })),

  // Used by getDisplayName — return a fake user object so display names work.
  DiscordRequest: vi.fn(async (endpoint: string) => {
    const userId = endpoint.split('/').pop() ?? 'unknown';
    const name = playerNames.get(userId) ?? userId;
    return fakeResponse({
      global_name: name,
      username: name,
      nick: null,
      user: { global_name: name, username: name },
    });
  }),
}));

// ─── Mock job schedulers (no real pg-boss jobs needed) ────────────────────────

vi.mock('../jobs/dayVoting.js', () => ({
  scheduleDayVoting: vi.fn(),
  scheduleDayTimeout: vi.fn(),
  boss: { send: vi.fn() },
}));

vi.mock('../jobs/nightTimeout.js', () => ({ scheduleNightTimeout: vi.fn() }));
vi.mock('../jobs/dayTimeout.js', () => ({ scheduleDayTimeout: vi.fn() }));
vi.mock('../jobs/hunterShotTimeout.js', () => ({
  registerHunterShotTimeoutWorker: vi.fn(),
}));

vi.mock('../logging.js', () => ({ logEvent: vi.fn() }));

// ─── Imports (after mocks are registered) ────────────────────────────────────

import { pool } from '../db/client.js';
import { createGame, getGame, startGame } from '../db/games.js';
import { addPlayer, getPlayersForGame } from '../db/players.js';
import { getNightActionsForNight, recordNightAction } from '../db/nightActions.js';
import { recordDayVote } from '../db/votes.js';
import { recordLovers } from '../db/cupid.js';
import { getPendingHunterShot } from '../db/hunterShots.js';
import {
  maybeResolveDay,
  maybeResolveNight,
  resolveHunterShot,
} from '../game/engine/gameOrchestrator.js';
import {
  dmNightActionsForAlivePlayers,
  dmRolesForAssignments,
} from '../game/engine/dmRoles.js';
import { chooseSetup } from '../game/balancing/chooseSetup.js';
import { ROLE_REGISTRY, isRoleName } from '../game/balancing/roleRegistry.js';
import { WOLF_PACK_ROLES, type NightActionKind, type RoleName } from '../game/types.js';
import type { AssignedRole } from '../game/types.js';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Number of fake players. Must be ≥ 5 (minimum for chooseSetup). */
const PLAYER_COUNT = 9;

const NAMES = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Ethan',
  'Fiona', 'George', 'Hana', 'Ivan', 'Julia', 'Ken', 'Lily',
];

const GAME_ID = `sim-${Date.now()}`;
const SIM_CHANNEL = 'sim-game-channel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Extract readable text from a Discord message body (plain or Components V2). */
function extractText(body: unknown): string {
  if (!body || typeof body !== 'object') return String(body);
  const b = body as Record<string, unknown>;
  if (typeof b.content === 'string') return b.content;
  if (Array.isArray(b.components)) {
    const texts: string[] = [];
    const traverse = (comps: unknown[]) => {
      for (const c of comps) {
        if (!c || typeof c !== 'object') continue;
        const comp = c as Record<string, unknown>;
        if (typeof comp.content === 'string') texts.push(comp.content);
        if (Array.isArray(comp.components)) traverse(comp.components);
      }
    };
    traverse(b.components);
    return texts.join('\n');
  }
  return '';
}

/** Replace all <@userId> Discord mentions with readable names. */
function resolveMentions(text: string, nameOf: (id: string) => string): string {
  return text.replace(/<@([^>]+)>/g, (_, userId) => `@${nameOf(userId)}`);
}

/** Print and clear all captured messages from this round. */
function flushMessages(nameOf: (id: string) => string): void {
  // Channel messages (public game narration)
  for (const msg of captured.channelMessages) {
    if (msg.channelId !== SIM_CHANNEL) continue;
    const text = extractText(msg.body);
    if (text) {
      console.log('\n[CHANNEL]');
      console.log(resolveMentions(text, nameOf));
    }
  }

  // DMs grouped by player
  const byUser = new Map<string, unknown[]>();
  for (const dm of captured.dms) {
    if (!byUser.has(dm.userId)) byUser.set(dm.userId, []);
    byUser.get(dm.userId)!.push(dm.body);
  }
  for (const [userId, bodies] of byUser) {
    const name = nameOf(userId);
    const texts = bodies.map(extractText).filter(Boolean);
    if (texts.length > 0) {
      console.log(`\n[DM → ${name}]`);
      console.log(resolveMentions(texts.join('\n---\n'), nameOf));
    }
  }

  captured.channelMessages.length = 0;
  captured.dms.length = 0;
}

// ─── Simulation Actions ───────────────────────────────────────────────────────

async function autoSubmitNightActions(
  gameId: string,
  night: number,
  hasExtraKill: boolean,
  nameOf: (id: string) => string,
): Promise<void> {
  const players = await getPlayersForGame(gameId);
  const round1Actions = await getNightActionsForNight(gameId, night, 1);
  const alreadyActed = new Set(round1Actions.map((a) => a.actor_id));

  for (const player of players) {
    if (!player.is_alive) continue;
    if (alreadyActed.has(player.user_id)) continue;
    if (!isRoleName(player.role)) continue;

    const def = ROLE_REGISTRY[player.role];
    if (def.nightAction.kind === 'none') continue;
    if (def.isNightActionRequired && !def.isNightActionRequired({ nightNumber: night })) continue;

    const alive = players.filter((p) => p.is_alive);
    const others = alive.filter(
      (p) => def.nightAction.canTargetSelf || p.user_id !== player.user_id,
    );

    if (def.nightAction.kind === 'link') {
      // Cupid: choose two random non-self players as Lovers
      const choices = shuffle(others.filter((p) => p.user_id !== player.user_id));
      const loverA = choices[0];
      const loverB = choices[1];
      if (!loverA || !loverB) continue;

      await recordLovers({ gameId, loverAId: loverA.user_id, loverBId: loverB.user_id });
      await recordNightAction({
        gameId, night, round: 1,
        actorId: player.user_id, targetId: loverB.user_id,
        actionKind: 'link', role: 'cupid',
      });
      console.log(
        `  [action] ${nameOf(player.user_id)} (cupid) links ` +
        `${nameOf(loverA.user_id)} ♥ ${nameOf(loverB.user_id)}`,
      );
      continue;
    }

    // Wolves prefer non-wolf targets for kill actions
    let candidates = others;
    if (
      def.nightAction.kind === 'kill' &&
      WOLF_PACK_ROLES.has(player.role as RoleName)
    ) {
      const nonWolves = others.filter((p) => !WOLF_PACK_ROLES.has(p.role as RoleName));
      if (nonWolves.length > 0) candidates = nonWolves;
    }

    const target = candidates.length > 0 ? pickRandom(candidates) : null;
    await recordNightAction({
      gameId, night, round: 1,
      actorId: player.user_id, targetId: target?.user_id ?? null,
      actionKind: def.nightAction.kind as NightActionKind,
      role: player.role as RoleName,
    });
    console.log(
      `  [action] ${nameOf(player.user_id)} (${player.role}) → ` +
      `${target ? nameOf(target.user_id) : 'pass'}`,
    );
  }

  // Wolf Cub bonus round 2: submit second kill if needed
  if (hasExtraKill) {
    const round2Actions = await getNightActionsForNight(gameId, night, 2);
    if (round2Actions.length === 0) {
      const wolves = players.filter(
        (p) => p.is_alive && WOLF_PACK_ROLES.has(p.role as RoleName),
      );
      const nonWolves = players.filter(
        (p) => p.is_alive && !WOLF_PACK_ROLES.has(p.role as RoleName),
      );
      if (wolves.length > 0 && nonWolves.length > 0) {
        const target = pickRandom(nonWolves);
        for (const wolf of wolves) {
          await recordNightAction({
            gameId, night, round: 2,
            actorId: wolf.user_id, targetId: target.user_id,
            actionKind: 'kill', role: wolf.role as RoleName,
          });
        }
        console.log(`  [round2] wolf pack extra kill → ${nameOf(target.user_id)}`);
      }
    }
  }
}

async function autoSubmitDayVotes(
  gameId: string,
  day: number,
  round: number,
  nameOf: (id: string) => string,
): Promise<void> {
  const players = await getPlayersForGame(gameId);
  const alive = players.filter((p) => p.is_alive);

  for (const voter of alive) {
    const others = alive.filter((p) => p.user_id !== voter.user_id);
    if (others.length === 0) continue;
    const target = pickRandom(others);
    await recordDayVote({ gameId, day, round, voterId: voter.user_id, targetId: target.user_id });
    console.log(`  [vote]   ${nameOf(voter.user_id)} → ${nameOf(target.user_id)}`);
  }
}

async function autoResolveHunterShots(
  gameId: string,
  nameOf: (id: string) => string,
): Promise<void> {
  const players = await getPlayersForGame(gameId);
  const deadHunters = players.filter((p) => !p.is_alive && p.role === 'hunter');

  for (const hunter of deadHunters) {
    const pending = await getPendingHunterShot(gameId, hunter.user_id);
    if (!pending) continue;

    const alive = players.filter((p) => p.is_alive && p.user_id !== hunter.user_id);
    const target = alive.length > 0 ? pickRandom(alive) : null;

    console.log(
      `  [hunter] ${nameOf(hunter.user_id)} shoots → ` +
      `${target ? nameOf(target.user_id) : 'passes'}`,
    );
    await resolveHunterShot(gameId, hunter.user_id, target?.user_id ?? null);
  }
}

// ─── The Simulation ───────────────────────────────────────────────────────────

describe('Werewolf Simulation', () => {
  afterAll(async () => {
    // Clean up the sim game. Foreign keys cascade from games → all child tables.
    await pool.query('DELETE FROM games WHERE id = $1', [GAME_ID]);
    await pool.end();
  });

  test(
    'full game from night 1 to end',
    async () => {
      if (PLAYER_COUNT > NAMES.length) {
        throw new Error(`Increase NAMES array — need ${PLAYER_COUNT} entries.`);
      }

      // ── 1. Build fake players ────────────────────────────────────────────
      const playerIds = Array.from({ length: PLAYER_COUNT }, (_, i) => `sim-p${i + 1}`);
      const namesList = NAMES.slice(0, PLAYER_COUNT);
      for (let i = 0; i < playerIds.length; i++) {
        playerNames.set(playerIds[i]!, namesList[i]!);
      }
      const nameOf = (id: string) => playerNames.get(id) ?? id;

      // ── 2. Create game + add players ─────────────────────────────────────
      await createGame({
        id: GAME_ID,
        guildId: null,
        channelId: SIM_CHANNEL,
        hostId: playerIds[0]!,
      });
      for (const id of playerIds) {
        await addPlayer(GAME_ID, id);
      }

      // ── 3. Assign roles via chooseSetup ──────────────────────────────────
      const setup = chooseSetup(PLAYER_COUNT);
      const shuffledPlayers = shuffle(playerIds);
      const assignments: AssignedRole[] = shuffledPlayers.map((userId, i) => ({
        userId,
        role: setup[i]! as RoleName,
        alignment: ROLE_REGISTRY[setup[i]! as RoleName].alignment,
      }));

      // Persist assignments to DB
      for (const a of assignments) {
        await pool.query(
          'UPDATE game_players SET role = $1, alignment = $2 WHERE game_id = $3 AND user_id = $4',
          [a.role, a.alignment, GAME_ID, a.userId],
        );
      }

      console.log('\n' + '='.repeat(60));
      console.log('WEREWOLF SIMULATION');
      console.log(`Players (${PLAYER_COUNT}): ${namesList.join(', ')}`);
      console.log('='.repeat(60));
      console.log('\nROLE ASSIGNMENTS:');
      for (const a of assignments) {
        console.log(`  ${nameOf(a.userId).padEnd(9)} → ${a.role} (${a.alignment})`);
      }

      // ── 4. Start game (night 1) ──────────────────────────────────────────
      await startGame(GAME_ID);
      const startedGame = (await getGame(GAME_ID))!;

      // Send role intro DMs
      await dmRolesForAssignments({ game: startedGame, assignments });
      flushMessages(nameOf);

      // Send night 1 action prompts (the orchestrator handles this automatically
      // for subsequent nights; we do it once manually here for night 1)
      const night1Players = await getPlayersForGame(GAME_ID);
      await dmNightActionsForAlivePlayers({ game: startedGame, players: night1Players });
      flushMessages(nameOf);

      // ── 5. Game loop ─────────────────────────────────────────────────────
      let loopGuard = 0;
      const MAX_LOOPS = 60; // Safety — a game should end well before this

      while (loopGuard++ < MAX_LOOPS) {
        const g = await getGame(GAME_ID);
        if (!g || g.status === 'ended') break;

        if (g.status === 'night') {
          console.log(`\n${'─'.repeat(60)}`);
          console.log(`NIGHT ${g.current_night}`);
          console.log('─'.repeat(60));

          await autoSubmitNightActions(
            GAME_ID,
            g.current_night,
            g.wolf_extra_kills_next_night > 0,
            nameOf,
          );
          await maybeResolveNight(GAME_ID);
          await autoResolveHunterShots(GAME_ID, nameOf);

        } else if (g.status === 'day' || g.status === 'day_second_lynch') {
          const isSecondLynch = g.status === 'day_second_lynch';
          console.log(`\n${'─'.repeat(60)}`);
          console.log(`DAY ${g.current_day}${isSecondLynch ? ' (second lynch round)' : ''}`);
          console.log('─'.repeat(60));

          const voteRound = isSecondLynch ? 2 : 1;
          await autoSubmitDayVotes(GAME_ID, g.current_day, voteRound, nameOf);
          await maybeResolveDay(GAME_ID);
          await autoResolveHunterShots(GAME_ID, nameOf);
        }

        flushMessages(nameOf);
      }

      if (loopGuard >= MAX_LOOPS) {
        console.warn('\n[SIM] Hit max loop guard — game may not have ended cleanly.');
      }

      // ── 6. Final summary ─────────────────────────────────────────────────
      const finalGame = await getGame(GAME_ID);
      const finalPlayers = await getPlayersForGame(GAME_ID);

      console.log('\n' + '='.repeat(60));
      console.log(`SIMULATION COMPLETE  (ended: ${finalGame?.status ?? 'unknown'})`);
      console.log('='.repeat(60));
      console.log('\nFINAL PLAYER STATE:');
      for (const p of finalPlayers) {
        const status = p.is_alive ? '✓ alive' : '✗ dead ';
        console.log(
          `  ${nameOf(p.user_id).padEnd(9)} ${status}  ${p.role.padEnd(14)} (${p.alignment})`,
        );
      }

      // This test always passes — its value is the console output.
      expect(true).toBe(true);
    },
    120_000, // 2-minute timeout
  );
});
