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

**Roles & alignments (22 roles)**  
Town, Wolf, Neutral, and Cult teams, plus Lovers overlays.

**Town roles**

| Role | Summary |
|---|---|
| Villager | No night action. Votes during the day; wins with town. |
| Seer | Nightly inspect that reveals the target’s exact role (e.g. `werewolf`, `doctor`, `alpha_wolf`). |
| Fool | Thinks they’re the Seer, but each inspection returns a completely random role, unrelated to the target. |
| Doctor | Guards one player each night (can self‑protect). Blocks direct wolf and Serial Killer attacks; may die when protecting a wolf pack member. |
| Hunter | No night action. When eliminated by *any* cause, gets a one‑off shot at another player before the phase ends. |
| Cupid | Night 1 only: links two Lovers. If one dies, the other dies of sorrow; Lovers can share in each other’s win or win together as the last two alive. |
| Mason | No night action. All masons learn each other at game start (confirmed town cell). |
| Harlot | Visits one player each night. Wolves miss if they attack her empty house, but she dies if she visits a wolf pack member or the Serial Killer, or the player they chose to kill. |
| Clumsy Guy | No night action. Each day vote has a 50% chance to be silently redirected to a random other alive player. |
| Chemist | Acts on odd nights only. Starts a duel with a home target; a 50/50 roll decides whether the Chemist or the target drinks the poison and dies (doctor cannot save either). |
| Thief | Night 1 only: steals the target’s role; the target becomes a Villager. If the stolen role is wolf‑aligned, the Thief joins the wolf team. |
| TroubleMaker | Once per game, during the day, can trigger a **double‑lynch day** where two lynches are resolved instead of one. |
| Cult Hunter | Each night, hunts one player; if they are a cultist, they die. If the cult ever targets the Hunter for conversion, their newest member dies instead. |
| Traitor | Starts as town‑aligned with no night powers. If all current wolves die while the Traitor is alive, they flip to a werewolf and join the pack. |

**Wolf‑team roles**

| Role | Summary |
|---|---|
| Werewolf | Core wolf pack member. The pack collectively chooses one (or more, with bonuses) kill targets each night. |
| Wolf Cub | Wolf pack member. When the Wolf Cub dies, the pack gains an extra kill on the following night. |
| Alpha Wolf | Pack leader. Hunts like a normal wolf, but each night there is a 20% chance the primary target is **bitten** and turned into a werewolf instead of dying (if they are home, unprotected, and not already wolf‑aligned). |
| Sorcerer | Wolf‑aligned seer. Each night learns whether a target is wolf‑aligned, the true Seer, or neither. Does not participate in the pack kill and does not trigger doctor retaliation. |

**Neutral solos**

| Role | Summary |
|---|---|
| Arsonist | Douses houses over multiple nights, then can ignite all doused houses at once. Fire kills occupants and visitors; doctor cannot prevent it. Wins only as the sole survivor (Lover edge‑cases aside). |
| Serial Killer | Solo killer who can target anyone each night, ignoring home/away. Doctor can block them; if wolves attack the Serial Killer at home, there is a small chance they succeed, but usually one wolf dies instead. Wins only as sole survivor (Lover edge‑cases aside). |
| Tanner | No night action. Wants to be lynched; if lynched during the day, the Tanner wins alone and everyone else loses. |

**Cult**

| Role | Summary |
|---|---|
| Cultist | Every other night (1, 3, 5, …) the cult votes on one player to convert; that player loses their old role and joins the cult. Wolves and the Serial Killer are immune; a Cultist who targets the Cult Hunter dies instead. The cult wins when all living players are cult‑aligned. |

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
│   │   ├── wolfCub.ts
│   │   ├── alphaWolf.ts
│   │   ├── seer.ts
│   │   ├── fool.ts
│   │   ├── doctor.ts
│   │   ├── hunter.ts
│   │   ├── mason.ts          Masons learn each other at game start
│   │   ├── cupid.ts
│   │   ├── harlot.ts
│   │   ├── clumsyGuy.ts
│   │   ├── chemist.ts
│   │   ├── sorcerer.ts
│   │   ├── arsonist.ts
│   │   ├── serialKiller.ts
│   │   ├── tanner.ts
│   │   ├── traitor.ts
│   │   ├── thief.ts
│   │   ├── troublemaker.ts
│   │   ├── cultist.ts
│   │   └── cultHunter.ts
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
│   │   ├── nightActionProcessors.ts Role-specific night logic (seer, doctor, harlot, chemist, arsonist, serial killer, cult, etc.)
│   │   ├── nightResolution.ts       Determines when night is complete; picks wolf kill victim
│   │   ├── dayResolution.ts         Plurality vote tally; tie = no-lynch
│   │   ├── winConditions.ts         Town / wolf / neutral solo / cult win checks
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
              │    Night    │  wolves kill, seer/sorcerer/fool inspect, doctor protects,
              │             │  harlot visits, chemist duels, arsonist douses, Serial Killer and cult act
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
- Wolf pack composition: for 1 wolf you always get a plain `werewolf`; for 2+ wolves, roles are drawn from `werewolf`, `wolf_cub`, and `alpha_wolf`.
- Sorcerer: added automatically when there are 3+ wolves (and enough players), or with a 60% chance at exactly 2 wolves.
- Neutral slot: in medium‑to‑large games (8+ players), there is a chance to add **exactly one** neutral/side faction, chosen from `arsonist`, `serial_killer`, `tanner`, `traitor`, or `cultist` (subject to their `minPlayers`).
- If a `cultist` is chosen, a `cult_hunter` is also added on the town side so the cult always has a dedicated counter‑role.

**Stage 2 — town power budget**
- A numeric “power budget” is derived from the opposition:
  - Scales with wolf count.
  - Adds extra budget when a neutral solo is present.
  - Adds a small bonus if the pack includes an Alpha Wolf, and a larger bonus if a Cultist is in the setup (to fund the Cult Hunter and extra town power).
- Town power roles are shuffled and drawn until the budget or player slots are exhausted:

  | Role | Strength | Notes |
  |---|---|---|
  | Seer | 2.5 | Exact‑role inspector |
  | Doctor | 1.5 | Night protection vs wolves/SK |
  | Masons (pair) | 2.0 | Always added as a pair |
  | Hunter | 1.0 | Reactive shot on death |
  | Harlot | 0.75 | High‑risk visiting role |
  | Chemist | 1.25 | Odd‑night duel killer |
  | Cupid | 0.75 | Lovers side‑win condition |
  | Thief | 1.25 | Role‑stealing swing piece |
  | TroubleMaker | 0.75 | Once‑per‑game double‑lynch day |

- `clumsy_guy` is added as a chaos role with 40% probability after the budget is spent, if there is room and the player count is high enough.
- `fool` is added for free (does not spend from the budget) when a real `seer` is present and there’s room for both.
- Remaining slots are filled with plain Villagers.
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
| `cult_members` | Tracks everyone who has ever joined the cult in a game (with join order) |
| `game_lovers` | Stores the Lover pair chosen by Cupid for a game |

A unique partial index on `(channel_id, guild_id) WHERE status <> 'ended'` enforces one active game per channel.

---

## Key design decisions

**Wolf pack vs wolf alignment.** `WOLF_PACK_ROLES` (`werewolf`, `wolf_cub`, `alpha_wolf`) is used for doctor retaliation, win-condition wolf counts, and setup scaling. `alignment === 'wolf'` (which also includes `sorcerer`) is used for seer inspection results and the wolf-team win check.

**Doctor protecting a wolf.** 75% chance the doctor dies (retaliation). Uses `WOLF_PACK_ROLES` — sorcerer does not trigger retaliation.

**Home vs away.** Only the Harlot is ever treated as “away from home”: when she uses her night **visit**, she leaves her own house and is marked as away for that night. Everyone else is always considered home for targeting rules. Key interactions:
- **Wolf kills:** if the wolves choose a target who is away (a visiting Harlot), the kill misses entirely. Otherwise, wolves kill the chosen victim plus certain visitors to that house (Harlot, Chemist, Cultist, Cult Hunter, etc.), unless blocked by the doctor.
- **Serial Killer:** SK attacks ignore home/away — they can kill targets who are home or out. Doctor protection can still block an SK attack.
- **Doctor:** always stays home while protecting and can guard any target; their protection applies only to direct wolf/SK attacks, not Chemist duels or Arsonist fire.
- **Harlot:** dies when visiting a wolf‑pack member or the Serial Killer, and also when visiting the wolves’ or SK’s chosen victim. Wolves miss her if they attack her own empty house.
- **Arsonist & Chemist:** Arsonist douses and ignites *houses* (killing occupants and visitors when ignited). Chemist duels require the target to be home; if the target is out, the duel is cancelled and the Chemist is notified.

**Wolves vs Serial Killer.**
- Wolves hunting the Serial Killer at home: roll once per night:
  - 20% — the pack manages to kill the Serial Killer (normal wolf kill).
  - 80% — the Serial Killer survives and one random wolf‑pack member dies instead, with a special “mysterious stab wounds” line in the dawn summary.
- If, in the same night, the Serial Killer also chose a wolf‑pack member as their own target, that duel is fully resolved in the wolf phase above; the SK’s own kill is skipped so you don’t get double deaths or duplicate narration.
- Wolves still miss the Serial Killer entirely if the SK is “away” killing someone else that night (wolves targeted SK’s house, but SK was out).

**Serial Killer targeting & wins.**
- SK can kill **any** role (wolves, town, neutrals, cult) and ignores home/away; only Doctor protection at home can stop an SK attack.
- SK deaths from Doctor‑immune mechanics (Chemist duel, Arsonist fire) are unaffected by doctor.
- Win rules:
  - If exactly **2 players** are alive and one is the Serial Killer, the SK wins immediately (with a “slaughtered everyone” style line), unless Lovers override the endgame.
  - If the SK is the **only** player alive, they also win.

**Arsonist fire.**
- Douse nights: Arsonist adds a player’s **house** to a persistent doused set and gets a DM; doctor can’t prevent dousing.
- Ignite night: if at least one house is doused, all doused houses burn:
  - Each doused player dies whether they were home or away (home vs away only changes narration flavor).
  - Any visitors whose night action targeted that house (doctor, Harlot, Chemist, Thief, Cultist, Cult Hunter, etc.) also die.
- Doctor protection never prevents arsonist kills.

**Chemist duel.**
- Acts on odd‑numbered nights only.
- If the chosen target is away, the duel is cancelled and the Chemist is told the house was empty.
- If the target is home, a 50/50 roll decides whether the Chemist or the target dies; both get dramatic DMs.
- Doctor cannot save either side from a Chemist duel.

**Cult vs Cult Hunter vs monsters.**
- Every night the cult votes on a single conversion target:
  - **Normal target** (town / neutral non‑immune): loses their old role and becomes a cultist; cult DMs announce the new member.
  - **Cult Hunter**: conversion backfires; the newest cult member dies instead, and the Hunter gets a special “you were targeted” DM.
  - **Wolf‑aligned or Serial Killer**: conversion fails and kills the converting cultist; the dying cultist and surviving cultists get distinct DMs explaining that the target is beyond their reach.
- Cult wins when **all living players** are cult‑aligned; Cult Hunter is town‑aligned and wins with town.

**Lovers & sorrow deaths.**
- Cupid links two Lovers on Night 1. They know each other’s identities but not roles.
- If exactly one Lover dies at any time (night kill, lynch, hunter shot, etc.), the survivor immediately dies of sorrow in the same phase; this sorrow death is noted explicitly in the channel with alignment/role reveal.
- Win overlays:
  - If the last two players alive are the Lovers, they win **alone** regardless of teams; base faction win text is suppressed.
  - If both Lovers survive and at least one of them is on the winning side (wolves, town, arsonist, or cult), an extra line announces that the Lovers also win together.

**Hunter reactive shot.**
- Whenever the Hunter dies (night, lynch, or second lynch on a TroubleMaker day), the channel gets a short “Hunter was attacked but their eyes light up…” then a “Hunter resolves their final shot…” line.
- Later, a separate message announces the shot result:
  - If they shoot: “Hunter took X down with them. They were Y.”
  - If they pass: a “Hunter lowered their weapon” line.
- The Hunter’s own generic death line is suppressed in the dawn summary so their death is only narrated through these special lines.

**Traitor.**
- Starts as a town‑aligned `traitor` with no night action.
- While unturned, the Seer sees the Traitor as a **villager** (role result), not “traitor”.
- As soon as all existing wolves are dead and the Traitor is still alive:
  - They automatically flip to `werewolf`/`wolf` alignment before any win checks.
  - From that night on they join the wolf team for win counting and Seer inspections.

**TroubleMaker double lynch.**
- TroubleMaker is town‑aligned and has no night action.
- Once per game, during a **day’s discussion period** (before voting opens), they receive a DM button to “Make trouble”.
- Clicking it marks that day as a double‑lynch day:
  - The normal lynch resolves using the usual plurality rules.
  - Immediately afterward, a **second** lynch is attempted using the same votes and rules.
  - Special roles (Wolf Cub, Hunter, Lovers) are handled correctly for both lynches.
- TroubleMaker still gets their own normal lynch vote like everyone else.

**All narration in one place.** `game/strings/narration.ts` is the single source of truth. The orchestrator contains zero inline strings.

**Atomic phase transitions.** `advancePhase()` uses a SQL `WHERE status = X` guard so concurrent timeout and manual resolution calls safely abort rather than double-transition.

**Phase contexts (`NightContext` / `DayContext`).** Night and day resolution are driven by explicit phase context objects that bundle the current `game`, player snapshot, actions or votes, and phase flags (e.g., Wolf Cub bonus, TroubleMaker double‑lynch state). The orchestrator builds these contexts once per phase and passes them through the resolution pipeline, which reduces repeated DB reads, keeps complex rules in one place, and simplifies testing.

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
