# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### General

- Mentioning the bot (`@Bot ping`) works as an alternative to the text prefix. This avoids conflicts when another bot shares the same prefix, and doubles as a recovery mechanism if the custom prefix is forgotten.

#### Commands

- **Administration:** `!settings` — Parent command for guild-level bot settings. Subcommands:
  - `prefix` — View or change the command prefix.
    - `set <prefix>` — Change the prefix to a custom value (max 5 characters, no spaces).
    - `reset` — Revert to the default prefix.
    - _(no args)_ — Show the current active prefix.
  - The default prefix is configurable globally via `DEFAULT_PREFIX` env var (default `!`). Each guild can still override per-server.

- **Administration:** `!role reaction` — Reaction role management (requires **Manage Roles**). Subcommands:
  - `add <message-id> <emoji> <role>` — Bind an emoji to a role on a message. Users who react with the emoji gain the role; removing the reaction loses it. The bot auto-reacts to confirm. Limited to 20 per message and 50 by default per community.
  - `remove <message-id> <emoji>` — Remove an emoji-to-role binding.
  - `clear <message-id>` — Remove all bindings from a message and clean up the bot's reactions.
  - `list [message-id] [page]` — Show all reaction role bindings with pagination and message previews.

- **Administration:** `!role join` — Join role management (requires **Manage Roles**). Subcommands:
  - `add <role> [member_age] [account_age]` — Assign a role when members join, with optional age-gated delays in minutes (member age max 7 days, account age max 30 days). Limited to a default 10 bindings per community.
  - `remove <role>` — Remove a join-role binding.
  - `list` — List all configured join roles for this server.
  - `pending` — Show pending delayed role assignments.

- **Administration:** `!role level` — Level role management (requires **Manage Roles**). Automatically assign roles when users reach a certain XP level. Subcommands:
  - `add <level> <role>` — Bind a role to a level. Users who reach this level get the role. Anyone who has already passed that level will receive the role on their next message. Limited to a default 20 bindings per community.
  - `remove <role>` — Remove a level-role binding.
  - `list` — List all configured level roles ordered by level.

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


- **Administration:** `!settings commands` — Per-guild command toggling. View all commands with their status, disable (`!settings commands disable <name>`), or re-enable (`!settings commands enable <name>`). The settings command itself cannot be disabled. Disabled commands show an explanatory message instead of executing.
- **Administration:** `!settings features` — Toggle data-storing features (XP/leveling and reputation) on or off without losing data. Use `!settings features enable|disable xp` or `!settings features enable|disable rep`. When a feature is disabled, existing data is preserved and can be re-enabled later.
- **`!settings clear`** — Selective data clearing. Clear XP data, reputation data, all role bindings (reaction/join/level), or everything at once. Subcommands: `xp`, `rep`, `roles`, `all`.

#### Actions

- **`announce`** — Post a message or embed to a channel. Configurable message text.
- **`purge`** — Bulk-delete recent messages in a channel. Configurable count (default 50, max 100).

#### Environment

- **`DEFAULT_PREFIX`** — New optional env var to set the global default command prefix (defaults to `!` when unset).
- **`FLUXER_API_URL`** — New optional env var for pointing the Fluxer adapter at a self-hosted Fluxer API instance. Defaults to `https://api.fluxer.app`.
- **`FLUXER_WEB_URL`** — New optional env var for custom Fluxer web URL used in clickable message links. Defaults to `https://web.fluxer.app`.

### Fixed

- **Join Roles**: Fluxer account age check now correctly derives the account
  creation date from the user's snowflake ID instead of always passing
  (Fluxer's user objects lack a `createdAt` property).
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
