# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Commands

- **Administration:** `!role reaction` — Reaction role management (requires **Manage Roles**). Subcommands:
  - `add <message-id> <emoji> <role>` — Bind an emoji to a role on a message. Users who react with the emoji gain the role; removing the reaction loses it. The bot auto-reacts to confirm. Limited to 20 per message and 50 per server by default (configurable).
  - `remove <message-id> <emoji>` — Remove an emoji-to-role binding.
  - `clear <message-id>` — Remove all bindings from a message and clean up the bot's reactions.
  - `list [message-id] [page]` — Show all reaction role bindings with pagination and message previews.

- **Automation:** `!task` — Task automation system for creating and managing scheduled or manual triggers. Subcommands:
  - `create <name> [action] [when]` — Create a task with plain English schedules (`daily`, `hourly`, `daily at 9am`) or raw cron. Inline config supported (`channel:#general message:Hello!`), or use draft mode.
  - `list` — View all tasks with status and last run time.
  - `show <name>` — View full task details, config, and available fields.
  - `rename <old> <new>` — Rename a task.
  - `reschedule <name> <when>` — Change the schedule. Pass `none` to convert to manual trigger.
  - `retool <name> <action>` — Swap the action type (e.g. `announce` -> `purge`).
  - `edit <name> <key>:<value>` — Set or clear config values.
  - `pause <name>` Pause a scheduled task.
  - `resume <name>` — Resume scheduled tasks.
  - `delete <name>` — Delete a task.
  - `run <name>` — Manually trigger any task immediately.
  - `history <name>` — View recent execution history.

#### Actions

- **`announce`** — Post a message or embed to a channel. Configurable message text.
- **`purge`** — Bulk-delete recent messages in a channel. Configurable count (default 50, max 100).

### Fixed

- **Utility**: Neofetch bot version now reads from `package.json` instead of
  being hardcoded, keeping it in sync with the actual release version.

## [0.3.0] - 2026-07-01

### Added

#### Commands

- **Administration**: `!ratelimit` — per-guild rate limit management. Server
  admins can view, set, or reset per-user and per-guild command rate limits.
  Subcommands: `user <n>`, `guild <n>`, `reset`.
- **Operation**: `!system ratelimit` — bot operators can set platform-wide
  rate limit caps that per-guild overrides cannot exceed.
  Subcommands: `user <n>`, `guild <n>`, `reset`.
- **Social**: `!rep` — award reputation points to other users with a
  default limit of 3 reps per day and repping the same user once per week.
- **Social**: `!profile` — consolidated rank and reputation viewer. Shows
  level, XP progress bar, XP rank, rep score, and rep rank for any user.
  Includes avatar thumbnail and colour-coded embed. Replaces `!rank`.
- **Operation**: `!system trends` — per-platform guild and member count
  trends over the last 30 days with SVG chart and growth stats
  (7d / 30d) in the embed.

#### Snapshots

- Periodic guild and member count snapshots recorded every 24 hours
  for each platform (Discord, Fluxer). Powers the trends chart.

#### Rate Limiting

- Guild admins with Manage Guild permission are exempt from the guild-level
  rate limit and from per-guild user overrides. Their user limit still
  respects the platform-wide cap.
- Bot operators (BOT_OPERATOR_IDS in .env) bypass all rate limits entirely.

### Changed

#### Commands

- **Operation**: `!system` — parent command for bot-operator functionality.
  Standalone commands `presence` and `status` consolidated under `!system`
  as subcommands.
- **Administration**: `!xp` — moved from Social to Administration. Both
  guild-config management commands now in a dedicated category.
- **Social**: `!slap` — reworked from pure-JS GIF encoding (LZW, ~7s) to
  manual animated WebP assembly via sharp/libwebp (~300ms). 23× generation
  speedup. Avatar download reduced to only fetch at 128px.
- **Help**: Added `Operation` and `Administration` categories for
  bot-operator and guild-config commands respectively.

### Fixed

#### Commands

- **Social**: `!roll` — parser now accepts spaces around operators
  (e.g. `2d4 + 3d6 + 7` works the same as `2d4+3d6+7`).

### Removed

#### Commands

- **Social**: `!rank` — removed in favour of the consolidated `!profile`
  command which combines rank and reputation display.

## [0.2.0] - 2026-06-14

### Added

#### Commands

- **Social**: `bean` — fake-ban a user with an optional reason.
- **Social**: `xp` — full XP/leveling system management (set, add, globalnotify, keyword bonuses).
- **Social**: `rank` — view your level, XP progress bar, and server rank.
- **Social**: `leaderboard` — top 10 XP leaderboard with medal emojis.
- **Social**: `levelnotify` — toggle personal level-up notifications.
- **Utility**: `neofetch` — system and bot stats with ASCII art.

#### XP System

- Message-based XP awards (10–19 XP per message, 60s cooldown).
- Triangular number level progression (`(L-1)×L÷2×100`).
- Keyword-triggered bonus XP configured by server admins.
- Guild-level and user-level notification settings.
- Per guild level-up message toggle.

#### CI/CD

- Deploy to Rancher on merge to `main` (staging) via GitHub Actions.
- Deploy to Rancher on merge to `production` or version tag (production).
- Shared `RANCHER_URL` and `RANCHER_TOKEN` at repo level; per-environment namespace and workload.

### Changed

#### Commands

- **Social**: `diceroll` renamed to `roll` and enhanced with full D&D notation (e.g. `2d20+6`) and critical hit/fail indicators.

### Fixed

#### Commands

- **Social**: `slap` — fixed Discord interaction timeout by adding `deferReply` support and calling it before the heavy GIF-fetching logic.

## [0.1.0] - 2026-06-10

### Added

#### Commands

- **Automation**: `remindme`.
- **Knowledge**: `define`, `currency`, `iss`, `thesaurus`, `translate`, `wiki`.
- **Moderation**: `purge`.
- **Social**: `8ball`, `coinflip`, `diceroll`, `slap`, `wheelspin`.
- **System**: `presence`, `status`.
- **Utility**: `avatar`, `calc`, `color`, `echo`, `help`, `ping`, `qrcode`, `timestamp`, `uptime`.

#### Platforms

- **Discord** adapter via discord.js.
- **Fluxer** adapter via @fluxerjs/core.

#### Deployment

- Docker multi-stage build (Node.js 24 Alpine).
- Docker Compose with profiles for SQLite and PostgreSQL backends.
