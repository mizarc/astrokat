# Astrokat — A Chat Companion for All

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-24.x-blue)
![Version](https://img.shields.io/badge/release-v0.1.0-orange)

A multi-platform chat bot that brings a shared set of fun and useful commands to **Fluxer** and **Discord**. Whether you need to do a quick calculation, a Wikipedia lookup, perform automated tasks, or a GIF of someone getting slapped, Astrokat has you covered!

## ✨ Features

- **Multi-platform by design** — Built on a shared command system. Write a command once, it works everywhere. Currently supports Discord and Fluxer.
- **20+ commands** — From utility (ping, calc, QR codes, timestamps) to social (coinflip, diceroll, wheelspin, slap with animated GIFs) to knowledge (Wikipedia, thesaurus, translations).
- **Persistent reminders** — Set `!remindme in 30 minutes ...` and get pinged when the time comes. Backed by SQLite (zero setup) or PostgreSQL for clustered deployments.
- **Fully localised** — All user-facing text is managed through locale files. Drop in a new language and Astrokat speaks it.
- **Pluggable adapters** — Adding a new chat platform is as simple as implementing a handful of methods.
- **Docker-first** — One command to start. SQLite for small deployments, PostgreSQL for larger scale clusters.

## 🏁 Getting Started

Before you can run the bot, you need to create bot applications on the platforms you want to use and obtain their tokens.

### Fluxer

#### 1. Create a bot application

1. Open the Fluxer client and go to **User Settings → Applications**.
2. Click **Create Application**, give it a name, and confirm.
3. Regenerate and copy the token. This is your `FLUXER_TOKEN`.

#### 2. Invite the bot to your server

1. Go to the **OAuth2 URL Builder** section in the application settings.
2. Under **Scopes**, select `bot`.
3. Under **Bot Permissions**, select:
   - `Send Messages`
   - `Read Message History`
   - `Manage Messages` — needed for the `purge` command
   - `Embed Links` — for rich command responses
   - `Attach Files` — for QR codes, slap GIFs, etc.
   - (Optional) `Use External Emoji` — for emoji in embeds
4. Copy the generated URL, open it in your browser, and select the server to add the bot to.

### Discord

#### 1. Create a bot application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Give it a name (e.g. "Astrokat") and click **Create**.
3. Go to the **Bot** tab in the left sidebar.
4. Under **Token**, click **Reset Token** then **Copy** — this is your `DISCORD_TOKEN`.
5. Under **Privileged Gateway Intents**, enable:
   - **Message Content Intent** — required for text-based commands (`!ping`, `!help`, etc.)
   - **Server Members Intent** — required for user lookups
   - (Optional) **Presence Intent** — required if you use presence-tracking features

#### 2. Invite the bot to your server

1. Go to the **OAuth2 → URL Generator** tab.
2. Under **Scopes**, select `bot` and `applications.commands`.
3. Under **Bot Permissions**, select:
   - `Send Messages`
   - `Read Message History`
   - `Manage Messages` — needed for the `purge` command
   - `Embed Links` — for rich command responses
   - `Attach Files` — for QR codes, slap GIFs, etc.
   - (Optional) `Use External Emoji` — for emoji in embeds
4. Copy the generated URL, open it in your browser, and select the server to add the bot to.

## 🐳 Docker Deployment

### Prerequisites
- [Docker](https://docs.docker.com/engine/install/) & [Docker Compose](https://docs.docker.com/compose/install/)

### Quick Start (SQLite — no external services)

1. **Create a project folder and download the files:**
   ```bash
   mkdir astrokat
   cd astrokat
   curl -LO https://raw.githubusercontent.com/mizarc/astrokat/main/docker-compose.yml
   curl -LO https://raw.githubusercontent.com/mizarc/astrokat/main/.env.example
   ```

2. **Configure the environment:**
   ```bash
   cp .env.example .env
   ```
   Open `.env` in any text editor and fill in at least `DISCORD_TOKEN` and/or `FLUXER_TOKEN` with the tokens you got from the previous category.

   If you want to use operator-only commands (`status`, `presence`), also add your operator ID:

   - **Fluxer:** Right-click your profile and click **Copy User ID**.
   - **Discord:** Enable Developer Mode (Settings → Advanced → Developer Mode), then right-click your profile and click **Copy User ID**.

   ```bash
   BOT_OPERATOR_IDS=123456789012345678
   ```

   For multiple operators, separate with commas:
   ```bash
   BOT_OPERATOR_IDS=123456789012345678,987654321098765432
   ```

3. **Start the bot:**
   ```bash
   docker compose up
   ```
   Astrokat is now running with SQLite storage, no external database needed.

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

### Updating

Pull the latest image and restart:

```bash
docker compose pull
docker compose up -d
```

Your `.env` file and SQLite data volume are preserved across updates.

### Backup (SQLite)

The SQLite database lives in a Docker named volume. To back it up:

```bash
# Find the exact volume name (pattern: <project>_astrokat-data)
docker volume ls | grep astrokat-data

# Back up to a compressed archive
docker run --rm -v <project>_astrokat-data:/data alpine tar czf - -C /data . > astrokat-backup-$(date +%F).tar.gz
```

> **Note:** Replace `<project>_astrokat-data` with your actual volume name from the first command.

To restore from a backup:

```bash
docker run --rm -v <project>_astrokat-data:/data alpine tar xzf - -C /data < astrokat-backup-2026-06-09.tar.gz
```

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

# Deploy Discord slash commands (also auto-deploys on startup)
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

## ⚙️ Environment Variables

Astrokat is configured through environment variables set in your `.env` file. Below is the full list of supported variables. Copy `.env.example` to `.env` and fill in the values relevant to your setup. Anything left as the default can be safely omitted.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADAPTERS` | No | `discord,fluxer` | Which chat platforms to connect to |
| `DISCORD_TOKEN` | Conditional | — | Discord bot token (needed for Discord) |
| `FLUXER_TOKEN` | Conditional | — | Fluxer bot token (needed for Fluxer) |
| `DISCORD_ID` | Yes, for slash commands | — | Discord application ID (slash commands auto-deploy on startup) |
| `BOT_OPERATOR_IDS` | No | — | Comma-separated user IDs allowed to run owner commands (!status, !presence) |
| `DATABASE_URL` | No | — | PostgreSQL connection string (unset → SQLite) |

## 📦 Storage Backends

Astrokat stores data in one of two backends. The bot picks automatically based on whether `DATABASE_URL` is set in your `.env` file. If set, it connects to PostgreSQL; otherwise it uses an embedded SQLite database.

| Backend | When to use | Setup |
|---|---|---|
| **SQLite** (default) | Single-instance deployment, quick start | No setup. Data persists in a Docker volume at `/app/data/astrokat.db`. |
| **PostgreSQL** | Multi-instance deployments where multiple bot processes share reminder data | Either spin up the bundled database via `docker compose --profile postgres up`, or set `DATABASE_URL` in `.env` to point at your own PostgreSQL instance. |

## 🤝 Contributing

Contributions are welcome! We're looking for people to help with bug fixes, new commands, translations, or documentation improvements. All we ask is that you follow the guidelines.

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for:

- Project structure overview
- How to add a new command
- Localization (i18n) workflow
- Testing and coding conventions
- Pull request process

Please also note that this project is governed by a [Code of Conduct](./CODE_OF_CONDUCT.md).

## 🔧 Troubleshooting

- **Bot is online but doesn't respond to commands.**
Make sure you invited the bot with the required permissions (see the permissions list for each platform above). On Discord, also verify the **Message Content Intent** is enabled in the Bot settings of the Developer Portal.

- **Bot joins the server but no slash commands (`/`) appear.**
The bot auto-deploys slash commands on startup. Restart the bot and after waiting a few seconds, they should appear. If they don't, verify `DISCORD_ID` is set correctly in your `.env` file.

- **`docker compose up` fails with "Cannot connect to the Docker daemon".**
Docker isn't running or isn't installed. Make sure Docker Desktop is open, or if on Linux, that the Docker service is started (`sudo systemctl start docker`).

- **`docker compose pull` says "pull access denied".**
You're trying to pull a private image. Astrokat is public. Make sure the image name is `ghcr.io/mizarc/astrokat:latest` (not `astrokat:latest` or another shorthand).

- **Bot runs but data isn't saved after a restart.**
The SQLite data volume isn't persisting. Check that the volume mapping is present in your `docker-compose.yml` (`astrokat-data:/app/data`) and that you're not running with `docker compose down -v` (the `-v` flag deletes volumes).

- **Permission denied when running Docker commands on Linux.**
Add your user to the Docker group: `sudo usermod -aG docker $USER`, then log out and back in.