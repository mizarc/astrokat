# Astrokat — A Chat Companion for All

A multi-platform chat bot that brings a shared set of fun and useful commands to **Fluxer** and **Discord**. Whether you need to do a quick calculation, a Wikipedia lookup, perform automated tasks, or a GIF of someone getting slapped, Astrokat has you covered!

## ✨ Features

- **Multi-platform by design** - Built on a shared command system. Write a command once, it works everywhere. Currently supports Discord and Fluxer.
- **20+ commands** - From utility (ping, calc, QR codes, timestamps) to social (coinflip, diceroll, wheelspin, slap with animated GIFs) to knowledge (Wikipedia, thesaurus, translations).
- **Persistent reminders** - Set `!remindme in 30 minutes ...` and get pinged when the time comes. Backed by SQLite (zero setup) or PostgreSQL for clustered deployments.
- **Fully localised** - All user-facing text is managed through locale files. Drop in a new language and Astrokat speaks it.
- **Pluggable adapters** - Adding a new chat platform is as simple as implementing a handful of methods.
- **Docker-first** - One command to start. SQLite for small deployments, PostgreSQL for larger scale clusters.

## 🐳 Docker Deployment

### Prerequisites
- [Docker](https://docs.docker.com/engine/install/) & [Docker Compose](https://docs.docker.com/compose/install/)

### Quick Start (SQLite — no external services)

1. **Create your `.env` file:**
   ```bash
   cp .env.example .env
   ```
   Then fill in at least `DISCORD_TOKEN` and/or `FLUXER_TOKEN`.

2. **Start the bot:**
   ```bash
   docker compose up
   ```
   This runs Astrokat with SQLite storage — no databases to manage.

### Start with PostgreSQL

```bash
docker compose --profile postgres up
```

The `postgres` profile spins up a PostgreSQL 17 container alongside the bot and configures it automatically via `DATABASE_URL`.

### Choose which adapters to run

Set `ADAPTERS` in your `.env` file:

| Value | Adapters |
|---|---|
| `discord,fluxer` | Both (default) |
| `discord` | Discord only |
| `fluxer` | Fluxer only |

### Run in background

```bash
docker compose up -d
docker compose --profile postgres up -d
```

### Stop

```bash
docker compose down
docker compose --profile postgres down
```

### View logs

```bash
docker compose logs -f
```

---

## 🚀 Local Development

### Prerequisites
- Node.js 24+
- npm

### Setup

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your tokens

# Deploy Discord slash commands (optional)
npm run deploy
```

### Run

```bash
npm run dev    # development mode with file watching
npm start      # production start
```

### Test

```bash
npm test
npm run test:coverage   # with coverage report
```

---

## 🗂️ Project Structure

```
src/
├── index.ts                     # Entry point — starts selected adapters
├── core/
│   ├── i18n.ts                  # Translation utility
│   ├── router.ts                # Command router
│   ├── types.ts                 # Shared types
│   └── commands/                # Bot commands (grouped by category)
│       ├── automation/
│       │   └── remindme.ts
│       ├── knowledge/
│       │   ├── thesaurus.ts
│       │   ├── translate.ts
│       │   └── wiki.ts
│       ├── social/
│       │   ├── coinflip.ts
│       │   ├── diceroll.ts
│       │   ├── slap.ts
│       │   └── wheelspin.ts
│       └── utility/
│           ├── avatar.ts
│           ├── calc.ts
│           ├── color.ts
│           ├── echo.ts
│           ├── ping.ts
│           ├── qrcode.ts
│           ├── timestamp.ts
│           └── uptime.ts
│   └── services/reminders/       # Reminder system
├── adapters/
│   ├── discord.ts               # Discord adapter
│   └── fluxer.ts                # Fluxer adapter
├── locales/
│   └── en.json                  # English translations
└── scripts/
    └── deploy-commands.ts        # Discord slash command deployer
```

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADAPTERS` | No | `discord,fluxer` | Which chat platforms to connect to |
| `DISCORD_TOKEN` | Conditional | — | Discord bot token (needed for Discord) |
| `FLUXER_TOKEN` | Conditional | — | Fluxer bot token (needed for Fluxer) |
| `DISCORD_ID` | For deploy | — | Discord application ID for slash commands |
| `DATABASE_URL` | No | — | PostgreSQL connection string (unset → SQLite) |

---

## 📦 Storage Backends

| Backend | When to use | Setup |
|---|---|---|
| **SQLite** | Single-instance, quick start | Zero config — data lives in a Docker volume |
| **PostgreSQL** | Multi-instance, clustered | Use `--profile postgres` or point at your own PG instance |

The bot auto-detects: if `DATABASE_URL` is set, it uses PostgreSQL; otherwise SQLite.