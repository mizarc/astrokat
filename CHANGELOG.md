# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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