# Werewolf Discord Bot

This repository contains a Discord bot that runs games of **Werewolf** in a Discord server using
slash commands and interactive components.

The project is written in **TypeScript**, uses **Express** to handle incoming interaction webhooks,
and stores game state in **PostgreSQL**.

---

## Features (current)

- Slash commands:
  - `/ww_create` – start a new game in the current channel.
  - `/ww_join` (button) – players join via a Join button under the create message.
  - `/ww_status` – show current phase and players in the channel’s active game.
  - `/ww_start` – host-only; assigns roles and begins Night 1.
  - `/ww_end` – host-only; ends the active game.
- Role system:
  - Werewolf, Villager, Seer, Doctor (extensible via `game/roles` + `ROLE_REGISTRY`).
  - Role assignment engine in `game/engine/assignRoles.ts`.
- Night phase automation:
  - Players receive DMs with their role and any night action they can take.
  - Wolves choose a target to kill; Doctor chooses someone to protect; Seer inspects a player.
  - Night actions are recorded in `night_actions` and resolved server-side.
  - Seer and Doctor receive DMs with the outcome of their actions.
  - Game automatically transitions to **day** with a summary of who (if anyone) died.
- Persistence:
  - Games and players stored in Postgres (`games`, `game_players`, `night_actions` tables).
  - Schema managed via `sql/schema.sql`.

---

## Prerequisites

- **Node.js** 18+ (you’re currently using Node 22).
- **npm**
- **PostgreSQL** 16 (local or hosted).
  - For local development, you can use Docker, e.g.:
    ```bash
    docker run --name werewolf-postgres -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_USER=postgres -e POSTGRES_DB=werewolf \
      -p 5432:5432 -d postgres:16
    ```
- A **Discord application** with:
  - A bot token.
  - Public key.
  - Application commands enabled.

---

## Environment variables

Create a `.env` file in the project root (this is already git‑ignored) with at least:

```env
DISCORD_TOKEN=your-bot-token
PUBLIC_KEY=your-app-public-key
APP_ID=your-application-id
DATABASE_URL=postgres://user:password@localhost:5432/werewolf
PORT=3000
```

The `DATABASE_URL` must be a valid Postgres connection string. In production (Render, Heroku, etc.)
you’ll typically get this from the hosting provider and don’t commit `.env` – just set env vars in
the service dashboard.

---

## Installation

```bash
git clone https://github.com/TsukkiGia/werewolf-discord.git
cd werewolf-discord
npm install
```

On first run, the app will initialize the database schema by executing `sql/schema.sql`.

---

## Building and running

### Build TypeScript

```bash
npm run build
```

This uses `tsc` with `tsconfig.json` and outputs compiled files into `dist/`.

### Run the bot server

```bash
npm run start
```

This runs:

```bash
npm run build && node dist/app.js
```

The Express server listens on `PORT` (default `3000`) and exposes:

- `POST /interactions` – Discord interaction webhook endpoint.
- `GET  /` – simple health‑check route.

You must point your Discord application’s **Interactions Endpoint URL** at your deployed URL
(`https://your-host.com/interactions`). For local development you can use a tunnelling tool
like `ngrok` or `cloudflared` to expose `localhost:3000`.

### Register slash commands

After you change `commands.ts` you should re‑register commands with Discord:

```bash
npm run register
```

This builds the project and runs `dist/commands.js`, which calls the Discord HTTP API to
bulk‑overwrite global application commands.

### Development mode

There is a simple `dev` script that rebuilds and restarts on changes:

```bash
npm run dev
```

Under the hood this uses `nodemon` to watch `.ts` files, run `npm run build`, then start
`dist/app.js`. (Make sure `nodemon` is installed globally or add it as a dev dependency.)

---

## Project structure

- `app.ts` – Express server + Discord interaction routing. Delegates game logic to helpers.
- `commands.ts` – Slash command definitions and registration logic.
- `utils.ts` – `DiscordRequest` and command registration helpers.
- `db/`
  - `client.ts` – Postgres client + `initDb` that runs `sql/schema.sql`.
  - `games.ts` – game row type, create/get/start/end/phase helpers.
  - `players.ts` – player join, role assignment, alive/dead state.
  - `nightActions.ts` – record + read night actions, process seer/doctor outcomes.
  - `client.js`, `games.js`, etc. – compiled JS (referenced via `db.ts` barrel).
- `db.ts` – re‑exports all DB helpers from `db/*`.
- `sql/schema.sql` – full database schema.
- `game/`
  - `types.ts` – shared role/action types.
  - `roles/` – per‑role definitions (villager, werewolf, seer, doctor).
  - `balancing/` – role registry + setup / validation (`ROLE_REGISTRY`, `chooseSetup`, etc.).
  - `engine/`
    - `assignRoles.ts` – deterministic role assignment.
    - `dmRoles.ts` – DMs players their role + night action menus.
    - `nightResolution.ts` – helper to choose final kill victim.
    - `winConditions.ts` – evaluates town vs wolves win state.

---

## Extending the game

Some ideas for next steps:

- **More phases**: full day‑vote flow (`/ww_vote` or vote buttons) and day resolution.
- **More roles**: add new role files in `game/roles`, register them in `ROLE_REGISTRY`,
  and update `chooseSetup` + `validateSetup`.
- **Multiple nights**: track night index per game and store `night` in actions.
- **Per‑guild config**: configurable setups or options per server.

The codebase is structured so that:

- HTTP / Discord wiring lives in `app.ts`.
- Game logic lives under `game/engine` and `game/balancing`.
- Persistence lives under `db/` and `sql/`.

Try to keep new game mechanics inside `game/*` or `db/*` helpers and have `app.ts`
just orchestrate calls between them.

---

## License

ISC © Gianna Torpey

