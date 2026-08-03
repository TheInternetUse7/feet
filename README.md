# FEET

**FEET**: **F**luxer **E**xpandable **E**veryday **T**oolkit — is a pluggable bot for [Fluxer](https://fluxer.app). It's built on the [`@fluxerjs/core`](https://www.npmjs.com/package/@fluxerjs/core) SDK.

Features are drop-in plugins called **TOEs** (Task/Operation Extensions). Each TOE is fully isolated and lives in its own folder under `src/toes/` — adding one is just dropping in a new folder.

## Features

| TOE          | What it does                                                                |
| ------------ | --------------------------------------------------------------------------- |
| **todo**     | Per-user task list with pending/completed states                            |
| **reminder** | Time-based reminders delivered to a channel or DM                           |
| **rss**      | Subscribe to RSS/Atom feeds; new items are posted as embeds every 5 minutes |
| **avatar**   | Show user avatars and server icons                                          |
| **info**     | Show user and server info (`.whois`, `.serverinfo`)                         |

Data lives in a local SQLite database (`node:sqlite`, WAL mode) — no external services required beyond Fluxer itself.

## Requirements

- **Node.js >= 22.5** (required for the built-in `node:sqlite` module)
- **pnpm** (Corepack ships with Node)
- A [Fluxer](https://fluxer.app) bot token

## Quick start

```bash
git clone https://github.com/TheInternetUse7/feet.git
cd feet
pnpm install

cp .env.example .env
# edit .env and set FLUXER_BOT_TOKEN

pnpm build
pnpm start
```

The bot connects to Fluxer, creates its database, and auto-loads every TOE found in `dist/toes/`.

### Environment variables

| Variable           | Required | Default     | Description                                             |
| ------------------ | -------- | ----------- | ------------------------------------------------------- |
| `FLUXER_BOT_TOKEN` | yes      | —           | Bot token from fluxer.app; the process exits if missing |
| `DB_PATH`          | no       | `./feet.db` | Where the SQLite database file lives                    |

## Commands

All commands use the `.` prefix (same as `.help`). Each TOE's help text is also available via `.help <name>`.

### `.todo`

| Command             | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `.todo add <task>`  | Add a new task                                              |
| `.todo list [done]` | List pending tasks (add `done` for completed)               |
| `.todo done <id>`   | Mark a task as completed                                    |
| `.todo remove <id>` | Delete a task                                               |
| `.todo clear --yes` | Remove all completed tasks (requires explicit confirmation) |

Tasks are scoped per user — everyone sees their own list.

### `.remind`

| Command                           | Description                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `.remind in <duration> <message>` | Set a reminder, e.g. `.remind in 10m Check oven`                                               |
| `.remind list`                    | Show pending reminders                                                                         |
| `.remind cancel <id>`             | Cancel a pending reminder                                                                      |
| `.remind dm on\|off`              | Deliver reminders via DM instead of the channel (falls back to the channel if DMs are blocked) |

Durations use `Ns`, `Nm`, `Nh`, `Nd` suffixes (seconds, minutes, hours, days).

### `.rss`

| Command                     | Description                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `.rss add <url> [#channel]` | Subscribe to a feed (defaults to the current channel; channel can be a mention, ID, or name) |
| `.rss remove <id>`          | Unsubscribe from a feed                                                                      |
| `.rss list`                 | Show subscribed feeds and their status                                                       |
| `.rss limit <id> <n>`       | Max items posted per poll (1–50, `0` = unlimited, default 10)                                |
| `.rss backlog <id> [page]`  | Browse items that were skipped because of the post limit                                     |
| `.rss fetch`                | Manually check all feeds for new items right now                                             |

New items are posted to the subscribed channel as embeds; all feeds are polled every 5 minutes.

### `.avatar`

| Command                 | Description                                                   |
| ----------------------- | ------------------------------------------------------------- |
| `.avatar`               | Show your global avatar                                       |
| `.avatar <user>`        | Show a user's global avatar (mention, ID, or name)            |
| `.avatar member <user>` | Show a member's server-specific avatar (falls back to global) |
| `.avatar guild`         | Show the current server's icon                                |
| `.avatar guild <id>`    | Show another server's icon (bot must be in it)                |

### `.whois` / `.serverinfo`

| Command            | Description                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `.whois [user]`    | Show a user's info: ID, account creation date, badges, join date and roles (in a server), banner                       |
| `.serverinfo [id]` | Show a server's info: ID, owner, creation date, member/channel/role/emoji/sticker counts, verification level, features |

## Docker

A multi-stage `Dockerfile` builds a slim `node:24` image. The container runs as a non-root user and expects the database volume at `/app/data`.

```bash
docker build -t feet .
docker run -d \
  --env-file .env \
  -e DB_PATH=/app/data/feet.db \
  -v feet-data:/app/data \
  --restart unless-stopped \
  feet
```

`.env` is not baked into the image — supply it at deploy time (via `--env-file` or your orchestrator) and point `DB_PATH` at `/app/data/feet.db` for persistence.

## Development

```bash
pnpm check        # typecheck + lint + format check
pnpm build        # compile src/ -> dist/
pnpm start        # run the compiled bot (requires pnpm build first)
pnpm lint:fix     # auto-fix oxlint issues
pnpm format       # auto-format with oxfmt
```

## License

[MIT](./LICENSE)
