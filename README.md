# Werewolf Discord Bot

A Discord bot that runs full games of **Werewolf / Mafia** using slash commands, interactive buttons, and DMs. Written in **TypeScript**, backed by **PostgreSQL**, and hosted as an Express webhook server.

---

## Features

**Slash commands**
- `/ww_create` — open a lobby in the current channel (posts a Join button).
- `/ww_start` — host-only; assigns roles, DMs every player, and begins Night 1.
- `/ww_status` — show the current phase, alive players, and day/night number.
- `/ww_end` — host-only; immediately ends the active game.
- `/ww_help` — show command reference.

**Full game loop**
- Lobby → Night → Day → Night → … → Game over.
- Night actions collected via Discord DMs with interactive select menus.
- Day lynch via DM vote buttons sent to every alive player.
- Automatic phase transitions with configurable timeouts (pg-boss).
- Hunter reactive shot on elimination (night or lynch).
- All narration posted to the game channel.

**13 roles across 3 alignments**

| Role | Alignment | Night action |
|---|---|---|
| Villager | Town | None |
| Seer | Town | Inspect — learns the exact role of one player |
| Doctor | Town | Protect — shields one player from night kill (can self-protect) |
| Hunter | Town | None — shoots one player on elimination |
| Mason | Town | None — masons know each other at game start |
| Harlot | Town | Visit — dies if visiting a wolf or the wolf's target; escapes if wolves come for them |
| Clumsy Guy | Town | None — 50% chance their day vote misfires to a random player |
| Chemist | Town | Potion (odd nights only) — 50/50 who drinks the poison: them or the target |
| Werewolf | Wolf | Kill |
| Wolf Cub | Wolf | Kill — wolves get an extra kill the night after wolf cub dies |
| Alpha Wolf | Wolf | Kill — immune to seer inspection revealing wolf |
| Sorcerer | Wolf | Inspect — learns wolf/seer/other (limited vs seer); wins with wolves |
| Arsonist | Neutral | Douse/Ignite — douses houses over time, then ignites for a multi-kill; wins as last survivor |

---

## Architecture

```
werewolf-discord/
├── app.ts                    Express server; routes /interactions to handlers
├── commands.ts               Registers slash commands with Discord API
├── utils.ts                  Discord HTTP client (DiscordRequest, DM/channel helpers)
├── db.ts                     Re-exports all db/* helpers as one barrel import
│
├── handlers/
│   ├── commands.ts           Slash command handler (ww_create, ww_start, etc.)
│   └── components.ts         Button/select handler (join, night actions, day votes, hunter shot)
│
├── db/
│   ├── client.ts             Postgres pool + initDb (runs sql/schema.sql on startup)
│   ├── games.ts              Game row type; create/get/start/end/advancePhase helpers
│   ├── players.ts            Player join, role assignment, alive/dead state
│   ├── nightActions.ts       Record + query night actions (ON CONFLICT DO NOTHING dedup)
│   ├── nightActionPrompts.ts Track DM message IDs for disabling stale prompts
│   ├── dayVotePrompts.ts     Track day-vote DM message IDs
│   ├── votes.ts              Day vote recording
│   ├── hunterShots.ts        Hunter shot state (pending / resolved)
│   └── arsonist.ts           Persistent doused-player list
│
├── game/
│   ├── types.ts              RoleName, Alignment, RoleDefinition, NightActionDefinition, etc.
│   ├── roles/                One file per role — each exports a RoleDefinition object
│   │   ├── villager.ts
│   │   ├── werewolf.ts       Wolves learn pack members at game start
│   │   ├── seer.ts
│   │   ├── doctor.ts
│   │   ├── mason.ts          Masons learn each other at game start
│   │   ├── sorcerer.ts
│   │   ├── hunter.ts
│   │   ├── wolfCub.ts
│   │   ├── alphaWolf.ts
│   │   ├── harlot.ts
│   │   ├── clumsyGuy.ts
│   │   ├── chemist.ts
│   │   └── arsonist.ts
│   │
│   ├── balancing/
│   │   ├── roleRegistry.ts   ROLE_REGISTRY — maps RoleName → RoleDefinition
│   │   ├── buckets.ts        BUCKET_CONFIGS — role groupings for display/lookup
│   │   ├── chooseSetup.ts    Two-stage setup generator (wolf scaling + power budget)
│   │   └── validateSetup.ts  Hard checks: ≥1 wolf, unique roles, masons in pairs
│   │
│   ├── engine/
│   │   ├── assignRoles.ts           Calls chooseSetup, shuffles players, writes DB
│   │   ├── gameOrchestrator.ts      Night and day resolution; phase transitions; win check
│   │   ├── nightActionProcessors.ts Role-specific night logic (seer, doctor, harlot, chemist, arsonist)
│   │   ├── nightResolution.ts       Determines when night is complete; picks wolf kill victim
│   │   ├── dayResolution.ts         Plurality vote tally; tie = no-lynch
│   │   ├── winConditions.ts         Town/wolf/arsonist win checks
│   │   ├── dmRoles.ts               DMs role intros, night action menus, day vote buttons
│   │   ├── hunterShot.ts            Hunter reactive shot flow
│   │   └── status.ts                Narration line builders for channel announcements
│   │
│   └── strings/
│       └── narration.ts      Single source of truth for all game narration strings
│
├── jobs/
│   ├── nightTimeout.ts       pg-boss job: resolve night after timeout
│   ├── dayTimeout.ts         pg-boss job: resolve day after timeout
│   ├── dayVoting.ts          pg-boss job: open day vote DMs after dawn delay
│   └── hunterShotTimeout.ts  pg-boss job: auto-pass hunter shot after timeout
│
├── sql/
│   └── schema.sql            Full DB schema (games, game_players, night_actions, etc.)
│
└── tests/
    ├── chooseSetup.test.ts
    ├── validateSetup.test.ts
    ├── assignRoles.test.ts
    ├── nightResolution.test.ts
    ├── nightActionProcessors.test.ts
    ├── dayResolution.test.ts
    ├── winConditions.test.ts
    ├── sorcererActions.test.ts
    ├── wolfPackIntro.test.ts
    ├── dmRolesIntro.test.ts
    └── hunter.test.ts
```

---

## Game flow

```
/ww_create  →  lobby (join button in channel)
/ww_start   →  roles assigned, Night 1 DMs sent
                     │
              ┌──────▼──────┐
              │    Night    │  wolves kill, seer inspects, doctor protects,
              │             │  harlot visits, chemist duels, arsonist douses
              └──────┬──────┘
                     │ all required actions submitted (or timeout)
              ┌──────▼──────┐
              │    Dawn     │  deaths announced, seer/doctor results DMed
              └──────┬──────┘
                     │ win check
              ┌──────▼──────┐
              │     Day     │  players vote via DM buttons (plurality, tie = no-lynch)
              └──────┬──────┘
                     │ lynch + hunter shot (if triggered) + win check
                     └──────► repeat from Night, or game over
```

Phase transitions are driven by **pg-boss** jobs so they survive server restarts. `advancePhase()` uses a SQL `WHERE status = X` guard to prevent double-transitions under concurrency.

---

## Setup generation

`chooseSetup` uses a two-stage algorithm to balance any player count.

**Stage 1 — team sizes**
- Wolf count: `Math.ceil(playerCount / 5)` (min 1) — roughly 1 wolf per 5 players.
- Sorcerer added automatically when wolves ≥ 2 and 9+ players.
- Arsonist included probabilistically: never below 8 players, up to 70% chance at 14+.

**Stage 2 — town power budget**
- Budget = `wolves × 2.0 + 1.0 + (neutral ? 1.5 : 0)`.
- Power roles are shuffled and drawn until the budget is spent:

  | Role | Strength | Min players |
  |---|---|---|
  | Seer | 2.5 | 5 |
  | Doctor | 1.5 | 5 |
  | Masons (pair) | 2.0 | 8 |
  | Chemist | 1.25 | 7 |
  | Hunter | 1.0 | 6 |
  | Harlot | 0.75 | 6 |

- Clumsy Guy added with 40% probability after the budget is spent (chaos element, min 6 players).
- Remaining slots filled with plain Villagers.
- Up to 5 retries on validation failure; on total failure the game ends with a channel error message.

**To add a new role:**
1. Create `game/roles/yourRole.ts` implementing `RoleDefinition`.
2. Register it in `ROLE_REGISTRY` (`game/balancing/roleRegistry.ts`).
3. Set `minPlayers` on the definition.
4. Add it to `TOWN_POWER` (with a strength value) or `NEUTRAL_ROLES` in `chooseSetup.ts`.
5. Add it to `BUCKET_CONFIGS` in `buckets.ts` for display purposes.
6. Add the `RoleName` to the union in `game/types.ts`.

---

## Database schema

| Table | Purpose |
|---|---|
| `games` | One row per game: status (`lobby`/`night`/`day`/`ended`), host, channel, phase counters |
| `game_players` | One row per player per game: role, alignment, alive/dead |
| `night_actions` | One row per actor per night; `UNIQUE (game_id, night, actor_id)` prevents resubmission |
| `night_action_prompts` | DM message IDs so stale prompts can be disabled when night resolves |
| `day_votes` | One vote per player per day; `ON CONFLICT DO UPDATE` lets players change their vote |
| `day_vote_prompts` | DM message IDs for day vote buttons |
| `hunter_shots` | Pending/resolved hunter shot with continuation context (`night` or `day:N`) |
| `arsonist_douses` | Persistent set of doused player IDs per game |

A unique partial index on `(channel_id, guild_id) WHERE status <> 'ended'` enforces one active game per channel.

---

## Key design decisions

**Wolf pack vs wolf alignment.** `WOLF_PACK_ROLES` (`werewolf`, `wolf_cub`, `alpha_wolf`) is used for doctor retaliation, win-condition wolf counts, and setup scaling. `alignment === 'wolf'` (which also includes `sorcerer`) is used for seer inspection results and the wolf-team win check.

**Doctor protecting a wolf.** 75% chance the doctor dies (retaliation). Uses `WOLF_PACK_ROLES` — sorcerer does not trigger retaliation.

**Away players.** `buildAwayPlayerIds()` determines which players are out of their house each night. Shared across harlot (escapes wolf kill), arsonist fire (kills visitors at doused houses), and doctor (can't protect away players).

**All narration in one place.** `game/strings/narration.ts` is the single source of truth. The orchestrator contains zero inline strings.

**Atomic phase transitions.** `advancePhase()` uses a SQL `WHERE status = X` guard so concurrent timeout and manual resolution calls safely abort rather than double-transition.

---

## Prerequisites

- **Node.js** 18+
- **PostgreSQL** 16

For local development:

```bash
docker run --name werewolf-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=werewolf \
  -p 5432:5432 -d postgres:16
```

A **Discord application** with a bot token, public key, and application ID.

---

## Environment variables

Create `.env` in the project root:

```env
DISCORD_TOKEN=your-bot-token
PUBLIC_KEY=your-app-public-key
APP_ID=your-application-id
DATABASE_URL=postgres://user:password@localhost:5432/werewolf
PORT=3000
```

---

## Installation and running

```bash
npm install

# Build and start
npm run start

# Development (rebuilds on change via nodemon)
npm run dev

# Register slash commands with Discord
npm run register

# Run tests
npm test
```

The server listens on `PORT` (default 3000) and exposes:
- `POST /interactions` — Discord webhook endpoint (Ed25519 signature-verified).
- `GET /` — health check.

Point your Discord app's **Interactions Endpoint URL** at `https://your-host.com/interactions`. For local development use `ngrok` or `cloudflared` to expose `localhost:3000`.

---

## References

Role catalogue and balance ideas inspired by [tgwerewolf.com](https://tgwerewolf.com).

---

## License

ISC © Gianna Torpey
