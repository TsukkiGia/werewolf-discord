**Title:** Nightly Suspicion System for Werewolf Discord Bot

---

## Summary

- Add a minimal, database-backed “night suspicion” mechanic:
  - Each **alive** player can privately select one **alive, non-self** player they most suspect each night.
  - If they die during that night, their suspicion is revealed at dawn as a “dead-man clue”.
  - All suspicions over the whole game are tracked.
- At game end, compute and display a simple per-player suspicion accuracy scoreboard based on final wolf alignment.
- Follow existing TypeScript/Postgres, DM, and component-handler patterns; keep changes tightly scoped and testable.

---

## Implementation Changes

### 1. Database & Schema

**Files:**
- `sql/schema.sql`
- `db/nightSuspicions.ts` (new)
- `db.ts`

**Changes:**

1. **New table `night_suspicions`**

   Add after `day_vote_prompts` / `hunter_shots`:

   ```sql
   CREATE TABLE IF NOT EXISTS night_suspicions (
     id SERIAL PRIMARY KEY,
     game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
     night INTEGER NOT NULL,
     actor_id TEXT NOT NULL,
     target_id TEXT NOT NULL,
     created_at BIGINT NOT NULL,
     UNIQUE (game_id, night, actor_id)
   );
   ```

   - One suspicion per `(game_id, night, actor_id)`.
   - No prompts table; we only need the records themselves.

2. **New DB module `db/nightSuspicions.ts`**

   Implement (mirroring `db/votes.ts` & `db/nightActions.ts`):

   ```ts
   import { pool } from './client.js';

   export interface NightSuspicionRow {
     id: number;
     game_id: string;
     night: number;
     actor_id: string;
     target_id: string;
     created_at: number;
   }

   export async function recordNightSuspicion(params: {
     gameId: string;
     night: number;
     actorId: string;
     targetId: string;
   }): Promise<boolean> {
     const createdAt = Date.now();
     const result = await pool.query(
       `
       INSERT INTO night_suspicions (game_id, night, actor_id, target_id, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (game_id, night, actor_id) DO NOTHING
       `,
       [params.gameId, params.night, params.actorId, params.targetId, createdAt],
     );
     return (result.rowCount ?? 0) > 0;
   }

   export async function hasNightSuspicion(
     gameId: string,
     night: number,
     actorId: string,
   ): Promise<boolean> {
     const result = await pool.query(
       `
       SELECT 1
       FROM night_suspicions
       WHERE game_id = $1 AND night = $2 AND actor_id = $3
       LIMIT 1
       `,
       [gameId, night, actorId],
     );
     return (result.rowCount ?? 0) > 0;
   }

   export async function getNightSuspicionsForNight(
     gameId: string,
     night: number,
   ): Promise<NightSuspicionRow[]> {
     const result = await pool.query<NightSuspicionRow>(
       `
       SELECT id, game_id, night, actor_id, target_id, created_at
       FROM night_suspicions
       WHERE game_id = $1 AND night = $2
       ORDER BY created_at ASC
       `,
       [gameId, night],
     );
     return result.rows;
   }

   export async function getAllNightSuspicionsForGame(
     gameId: string,
   ): Promise<NightSuspicionRow[]> {
     const result = await pool.query<NightSuspicionRow>(
       `
       SELECT id, game_id, night, actor_id, target_id, created_at
       FROM night_suspicions
       WHERE game_id = $1
       ORDER BY night ASC, created_at ASC
       `,
       [gameId],
     );
     return result.rows;
   }
   ```

3. **DB barrel export**

   In `db.ts` append:

   ```ts
   export * from './db/nightSuspicions.js';
   ```

---

### 2. Night suspicion DM prompts

**Files:**
- `game/engine/dmRoles.ts`
- `game/engine/gameOrchestrator.ts`

**Changes:**

1. **New DM helper `dmNightSuspicionPrompts`**

   In `dmRoles.ts`, import `logEvent` (already imported) and add:

   ```ts
   export async function dmNightSuspicionPrompts(params: {
     game: GameRow;
     players: GamePlayerState[];
   }): Promise<void> {
     const { game, players } = params;

     const alivePlayers = players.filter((p) => p.is_alive);
     if (alivePlayers.length <= 1) return; // nothing to suspect if alone

     const nightNumber = game.current_night || 1;
     const aliveIds = alivePlayers.map((p) => p.user_id);

     for (const player of alivePlayers) {
       try {
         logEvent('night_suspicion_dm_send', {
           gameId: game.id,
           night: nightNumber,
           userId: player.user_id,
         });

         const dmChannelId = await openDmChannel(player.user_id);

         const options = [];
         for (const id of aliveIds) {
           if (id === player.user_id) continue; // no self-suspicion
           const label = await getDisplayName(id, game.guild_id);
           options.push({ label, value: id });
         }
         if (options.length === 0) continue;

         await postChannelMessage(dmChannelId, {
           flags: InteractionResponseFlags.IS_COMPONENTS_V2,
           components: [
             {
               type: MessageComponentTypes.TEXT_DISPLAY,
               content:
                 `Night ${nightNumber}: who do you most suspect is on the wolf team?\n` +
                 'Choose one living player. If you die tonight, your suspicion will be revealed at dawn.',
             },
             {
               type: MessageComponentTypes.ACTION_ROW,
               components: [
                 {
                   type: MessageComponentTypes.STRING_SELECT,
                   custom_id: `night_suspicion:${game.id}:${nightNumber}`,
                   placeholder: 'Choose the player you suspect most',
                   min_values: 1,
                   max_values: 1,
                   options,
                 },
               ],
             },
           ],
         });
       } catch (err) {
         console.error('Failed to DM night suspicion prompt to user', player.user_id, err);
         logEvent('night_suspicion_dm_error', {
           gameId: game.id,
           night: nightNumber,
           userId: player.user_id,
           error: err instanceof Error ? err.message : String(err),
         });
       }
     }
   }
   ```

2. **Wire into night start**

   In `game/engine/gameOrchestrator.ts`:

   - Extend import:

   ```ts
   import { dmNightActionsForAlivePlayers, disableDayVotePrompts, dmNightSuspicionPrompts } from './dmRoles.js';
   ```

   - Update `dmNightAndSchedule`:

   ```ts
   const players = await getPlayersForGame(gameId);
   await dmNightActionsForAlivePlayers({ game, players });
   await dmNightSuspicionPrompts({ game, players });
   await scheduleNightTimeout(gameId, game.current_night);
   ```

   Result: every alive player gets a suspicion DM at night, regardless of whether they have any other night action.

---

### 3. Interaction handling for night suspicions

**Files:**
- `handlers/components.ts`
- `app.ts`

**Changes:**

1. **Handler imports**

   In `handlers/components.ts` extend the DB import:

   ```ts
   import {
     getGame,
     addPlayer,
     getPlayersForGame,
     recordNightAction,
     recordDayVote,
     hasNightAction,
     hasDayVote,
     recordLovers,
     setTroublemakerDoubleLynchDay,
     recordNightSuspicion,
     hasNightSuspicion,
   } from '../db.js';
   ```

2. **New handler `handleNightSuspicion`**

   Add below `handleNightAction` or near other night handlers:

   ```ts
   export async function handleNightSuspicion(
     req: Request,
     res: Response,
     componentId: string,
   ) {
     const withoutPrefix = componentId.replace('night_suspicion:', '');
     const [gameId, nightStr] = withoutPrefix.split(':') as [string, string];

     const actorId = getInteractionUserId(req);
     if (!actorId) {
       return res.status(400).json({ error: 'missing user id' });
     }

     const game = await getGame(gameId);
     if (!game || game.status !== 'night') {
       return res.status(400).json({ error: 'no active night for this game' });
     }

     const requestedNight = Number(nightStr);
     const currentNight = game.current_night || 1;
     if (requestedNight !== currentNight) {
       return res.send({
         type: InteractionResponseType.UPDATE_MESSAGE,
         data: {
           flags: InteractionResponseFlags.IS_COMPONENTS_V2,
           components: [
             {
               type: MessageComponentTypes.TEXT_DISPLAY,
               content:
                 'This suspicion prompt is from a previous night and can no longer be used.',
             },
           ],
         },
       });
     }

     const players = await getPlayersForGame(gameId);
     const aliveIds = new Set(
       players.filter((p) => p.is_alive).map((p) => p.user_id),
     );

     if (!aliveIds.has(actorId)) {
       return res.send({
         type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
         data: {
           flags: InteractionResponseFlags.EPHEMERAL,
           content: 'Only living players in the game can submit night suspicions.',
         },
       });
     }

     const targetId: string | null =
       Array.isArray(req.body.data.values) && req.body.data.values.length > 0
         ? req.body.data.values[0]
         : null;

     if (!targetId || !aliveIds.has(targetId) || targetId === actorId) {
       return res.send({
         type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
         data: {
           flags: InteractionResponseFlags.EPHEMERAL,
           content:
             'You must choose a living player other than yourself as your suspicion.',
         },
       });
     }

     const nightNumber = currentNight;

     if (await hasNightSuspicion(gameId, nightNumber, actorId)) {
       return res.send({
         type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
         data: {
           flags: InteractionResponseFlags.EPHEMERAL,
           content:
             'You have already submitted your suspicion for this night. It cannot be changed.',
         },
       });
     }

     const inserted = await recordNightSuspicion({
       gameId,
       night: nightNumber,
       actorId,
       targetId,
     });

     if (!inserted) {
       return res.send({
         type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
         data: {
           flags: InteractionResponseFlags.EPHEMERAL,
           content:
             'You have already submitted your suspicion for this night. It cannot be changed.',
         },
       });
     }

     logEvent('night_suspicion_record', {
       gameId,
       night: nightNumber,
       actorId,
       targetId,
     });

     await res.send({
       type: InteractionResponseType.UPDATE_MESSAGE,
       data: {
         flags: InteractionResponseFlags.IS_COMPONENTS_V2,
         components: [
           {
             type: MessageComponentTypes.TEXT_DISPLAY,
             content: `Your suspicion has been recorded: you suspect <@${targetId}> is on the wolf team.`,
           },
         ],
       },
     });
   }
   ```

3. **Route the new handler**

   - In `app.ts` import it:

   ```ts
   import {
     handleJoinButton,
     handleNightAction,
     handleDayVote,
     handleHunterShot,
     handleCupidFirstPick,
     handleCupidSecondPick,
     handleTroublemakerDoubleLynch,
     handleNightSuspicion,
   } from './handlers/components.js';
   ```

   - In the `MESSAGE_COMPONENT` routing block, add:

   ```ts
   if (componentId.startsWith('night_suspicion:')) {
     return handleNightSuspicion(req, res, componentId);
   }
   ```

   (Place near the `night_action` branch for clarity.)

---

### 4. Dawn “dead-man suspicion” reveal

**Files:**
- `game/engine/gameOrchestrator.ts`
- `game/strings/narration.ts`

**Changes:**

1. **New narration line helper**

   In `game/strings/narration.ts`, add (non-random, for predictable tests):

   ```ts
   export function nightSuspicionRevealLine(
     actorId: string,
     targetId: string,
   ): string {
     return `Before they died, <@${actorId}> was most suspicious of <@${targetId}>.`;
   }
   ```

2. **Import DB + string helpers**

   At top of `gameOrchestrator.ts`:

   - Add to `../../db.js` import:

   ```ts
   import {
     // existing ...
     getLovers,
     getNightSuspicionsForNight,
     getAllNightSuspicionsForGame,
   } from '../../db.js';
   ```

   - Add to narration imports:

   ```ts
   import {
     // existing ...
     skCounterKillWolfDmLine,
     nightSuspicionRevealLine,
     // (scoreboard builder added in next section)
   } from '../strings/narration.js';
   ```

3. **Helper to build reveal lines**

   In `gameOrchestrator.ts`, near other small helpers (e.g., just before `maybeResolveNight`), add:

   ```ts
   async function buildNightSuspicionRevealLines(
     gameId: string,
     nightNumber: number,
     nightDeaths: NightDeathInfo[],
   ): Promise<string[]> {
     const victimIds = Array.from(
       new Set(nightDeaths.map((d) => d.playerId)),
     );
     if (victimIds.length === 0) return [];

     const suspicions = await getNightSuspicionsForNight(gameId, nightNumber);
     if (suspicions.length === 0) return [];

     const byActor = new Map<string, string>(); // actorId -> targetId
     for (const row of suspicions) {
       if (victimIds.includes(row.actor_id)) {
         byActor.set(row.actor_id, row.target_id);
       }
     }

     const lines: string[] = [];
     for (const actorId of victimIds) {
       const targetId = byActor.get(actorId);
       if (targetId) {
         lines.push(nightSuspicionRevealLine(actorId, targetId));
       }
     }
     return lines;
   }
   ```

   - We intentionally only reveal *this night’s* suspicion for players who died this night.
   - If they didn’t submit, they simply don’t appear.

4. **Use in night resolution**

   In `maybeResolveNight`:

   - Right after the Lover sorrow block (after `nightDeaths.push(sorrowDeath);`), add:

   ```ts
   const suspicionRevealLines = await buildNightSuspicionRevealLines(
     gameId,
     nightNumber,
     nightDeaths,
   );
   ```

   - In the Hunter-killed-at-night branch:

   ```ts
   const lines: string[] = buildNightSummaryLines(
     nightDeaths,
     updatedPlayers,
     doctorSavedSomeone,
     cultConverted,
   );
   lines.push(...suspicionRevealLines);
   if (biteConvertedId) lines.push(alphaWolfBiteChannelLine());
   lines.push(hunterResolveLine());
   ```

   - In the standard dawn-announcement branch:

   ```ts
   const lines: string[] = buildNightSummaryLines(
     nightDeaths,
     updatedPlayers,
     doctorSavedSomeone,
     cultConverted,
   );
   lines.push(...suspicionRevealLines);
   if (biteConvertedId) lines.push(alphaWolfBiteChannelLine());
   if (thiefActed) lines.push(thiefStoleLine());
   ```

   Result: any night victim with a submitted suspicion gets a clear “Before they died…” line in the dawn message; no line if they didn’t submit.

---

### 5. End-of-game suspicion scoreboard

**Files:**
- `game/engine/gameOrchestrator.ts`
- `game/strings/narration.ts`

**Changes:**

1. **Scorecard types & text**

   In `game/strings/narration.ts`:

   - Add a small, independent type (to avoid importing DB types):

   ```ts
   export interface SuspicionScore {
     playerId: string;
     total: number;
     correct: number;
     accuracyPct: number | null;
   }
   ```

   - Add a builder for score lines (below `finalRolesLines` or nearby):

   ```ts
   export function buildSuspicionScoreLines(scores: SuspicionScore[]): string[] {
     if (scores.length === 0) {
       return [];
     }

     const lines: string[] = ['Suspicion accuracy:'];
     for (const s of scores) {
       if (s.total === 0) {
         lines.push(`<@${s.playerId}> — 0 suspicions.`);
       } else {
         const pct = s.accuracyPct ?? Math.round((s.correct * 100) / s.total);
         lines.push(
           `<@${s.playerId}> — ${s.total} suspicions, ${s.correct} correct (${pct}% accuracy).`,
         );
       }
     }
     return lines;
   }
   ```

2. **Score computation helper**

   In `game/engine/gameOrchestrator.ts`, import the type & builder:

   ```ts
   import {
     // existing...
     skCounterKillWolfDmLine,
     nightSuspicionRevealLine,
     buildSuspicionScoreLines,
     type SuspicionScore,
   } from '../strings/narration.js';
   ```

   Add a pure computation helper (exported for tests) near the lovers helper:

   ```ts
   export function computeSuspicionScores(
     players: GamePlayerState[],
     suspicions: { actorId: string; targetId: string }[],
   ): SuspicionScore[] {
     const playersById = new Map(players.map((p) => [p.user_id, p]));
     const stats = new Map<string, { total: number; correct: number }>();

     for (const s of suspicions) {
       const actor = playersById.get(s.actorId);
       const target = playersById.get(s.targetId);
       if (!actor || !target) continue;

       // "Wolf team at game end" → final alignment === 'wolf'
       const isCorrect = target.alignment === 'wolf';

       const entry = stats.get(s.actorId) ?? { total: 0, correct: 0 };
       entry.total += 1;
       if (isCorrect) entry.correct += 1;
       stats.set(s.actorId, entry);
     }

     const scores: SuspicionScore[] = [];
     for (const p of players) {
       const entry = stats.get(p.user_id) ?? { total: 0, correct: 0 };
       const accuracyPct =
         entry.total > 0 ? Math.round((entry.correct * 100) / entry.total) : null;
       scores.push({
         playerId: p.user_id,
         total: entry.total,
         correct: entry.correct,
         accuracyPct,
       });
     }
     return scores;
   }
   ```

   Then add an async wrapper that pulls rows from the DB:

   ```ts
   async function buildSuspicionScoreboardForGame(
     gameId: string,
     players: GamePlayerState[],
   ): Promise<string[]> {
     const rows = await getAllNightSuspicionsForGame(gameId);
     if (rows.length === 0) return [];

     const records = rows.map((r) => ({
       actorId: r.actor_id,
       targetId: r.target_id,
     }));
     const scores = computeSuspicionScores(players, records);
     return buildSuspicionScoreLines(scores);
   }
   ```

3. **Include scoreboard in all end-of-game paths**

   - **Night-end (in `maybeResolveNight`)**

     In the branch where `win` is truthy:

     ```ts
     if (win) {
       const winLines = await buildWinLinesWithLovers(gameId, updatedPlayers, win);
       lines.push(...winLines);

       const scoreLines = await buildSuspicionScoreboardForGame(
         gameId,
         updatedPlayers,
       );
       lines.push(...scoreLines);

       lines.push(...finalRolesLines(updatedPlayers));
     } else {
       ...
     }
     ```

   - **Day-end (in the `maybeResolveDay`/day-resolution section near line ~1220)**

     In the block:

     ```ts
     if (win) {
       const winLines = await buildWinLinesWithLovers(gameId, updatedPlayers, win);
       lines.push(...winLines);

       const scoreLines = await buildSuspicionScoreboardForGame(
         gameId,
         updatedPlayers,
       );
       lines.push(...scoreLines);

       lines.push(...finalRolesLines(updatedPlayers));
     } else {
       lines.push(buildNightFallsLine());
     }
     ```

   - **Hunter-shot end (in `resolveHunterShot`)**

     In the `if (win)` block for the Hunter resolution:

     ```ts
     if (win) {
       const winLines = await buildWinLinesWithLovers(gameId, updatedPlayers, win);
       lines.push(...winLines);

       const scoreLines = await buildSuspicionScoreboardForGame(
         gameId,
         updatedPlayers,
       );
       lines.push(...scoreLines);

       lines.push(...finalRolesLines(updatedPlayers));
     }
     ```

   This ensures the suspicion scoreboard always appears immediately after the win lines and before final roles, regardless of how the game ends.

---

## Test Plan

**New tests**

1. **Suspicion scoreboard computation**

   - New file: `tests/suspicionStats.test.ts`.

   - Import `computeSuspicionScores` and `buildSuspicionScoreLines`:

     ```ts
     import { describe, it, expect } from 'vitest';
     import type { GamePlayerState } from '../db/players.js';
     import { computeSuspicionScores } from '../game/engine/gameOrchestrator.js';
     import { buildSuspicionScoreLines } from '../game/strings/narration.js';
     ```

   - Helper to make players:

     ```ts
     function makePlayer(partial: Partial<GamePlayerState>): GamePlayerState {
       return {
         user_id: 'u',
         role: 'villager',
         alignment: 'town',
         is_alive: true,
         ...partial,
       };
     }
     ```

   - Test cases:

     1. **No suspicions**:
        - Players: `a` (town), `w` (wolf).
        - `computeSuspicionScores(players, [])` should produce stats for both with `total=0, correct=0, accuracyPct=null`.
        - `buildSuspicionScoreLines` should yield:

          - First line: `'Suspicion accuracy:'`.
          - Contains `<@a>` with “0 suspicions”.
          - Contains `<@w>` with “0 suspicions”.

     2. **Mixed correct/incorrect suspicions**:
        - Same players.
        - Suspicion records:
          - `a` → `w`
          - `w` → `a`
          - `a` → `w` (second correct suspicion)
        - Expect:
          - For `a`: `total=2`, `correct=2`, `accuracyPct=100`.
          - For `w`: `total=1`, `correct=0`, `accuracyPct=0`.
        - Check lines include:
          - `<@a> — 2 suspicions, 2 correct (100% accuracy).`
          - `<@w> — 1 suspicions, 0 correct (0% accuracy).`

2. **(Optional but recommended) Dead-man suspicion reveal helper**

   - If you choose to further factor `buildNightSuspicionRevealLines` into a pure helper that accepts `victimIds` + suspicion records, add unit tests verifying:
     - A victim with a suspicion this night yields a line containing both `<@victim>` and `<@target>`.
     - Victims without a suspicion are omitted.
     - Non-victims’ suspicions are ignored for dawn reveal.

**Existing tests**

- Ensure the full suite still passes after adding:
  - New schema.
  - New DB module and exports.
  - New helpers and imports in the engine and narration.

Focus areas to run manually after implementation:

- `npm test` (full suite).
- `npm test -- suspicionStats` (new tests only).
- `tsc` (type-checking, especially around new imports / exports).

---

## Assumptions & Design Choices

- **Wolf team definition:** “On the wolf team at game end” is implemented as `alignment === 'wolf'` in the final `GamePlayerState`. This naturally includes a Traitor who has converted to wolf by game end and excludes neutrals like Arsonist and Serial Killer.
- **Suspicion frequency:** Players *may* submit one suspicion per night; they are not required to submit one every night. Nights without submissions count as 0 in their totals.
- **Immutability per night:** Once a suspicion has been recorded for a given `(game, night, actor)` it cannot be changed. This matches day-vote and night-action behavior.
- **Scope of reveal:** Only **night deaths** trigger the “dead-man suspicion” reveal, using suspicions from that same night. Day lynches and Hunter-shot deaths don’t reveal prior suspicions.
- **Away/home logic:** Suspicion is a pure meta-guess and is independent of home/away mechanics; any alive player can suspect any other alive player, regardless of night action / location.
- **Scoreboard placement:** Suspicion scoreboard appears in the final channel message for the game, immediately after the standard win lines (plus Lovers overlays) and before the final roles list.
- **Formatting:** Scoreboard uses straightforward numeric summaries; no extra styling beyond existing conventions (`<@...>` mentions, bold roles). Accuracy is rounded to the nearest integer percentage.

This plan should be directly implementable in the current codebase while remaining consistent with existing patterns for DB access, DM prompts, and orchestrator-driven end-of-game summaries.
