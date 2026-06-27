import { t } from './core/i18n.js';
import { startDiscordBot, DiscordGuildAggregator } from './adapters/discord.js';
import { startFluxerBot, FluxerGuildAggregator } from './adapters/fluxer.js';
import { reminderService } from './core/services/reminders/reminderService.js';
import { getCommands } from './core/router.js';
import { GuildSnapshotService } from './core/services/guildsnapshot/guildSnapshotService.js';
import { SqliteGuildSnapshotStore } from './core/services/guildsnapshot/guildSnapshotStoreSqlite.js';
import { PostgresGuildSnapshotStore } from './core/services/guildsnapshot/guildSnapshotStorePostgres.js';

console.log(t('system.starting'));

// Determine which adapters to start
const adapters = (process.env.ADAPTERS ?? 'discord,fluxer')
  .split(',')
  .map((a) => a.trim().toLowerCase());

const needDiscord = adapters.includes('discord');
const needFluxer = adapters.includes('fluxer');

// Validate tokens for selected adapters
if (needDiscord && !process.env.DISCORD_TOKEN) {
  console.error(t('system.missingToken', { adapter: 'Discord' }));
  process.exit(1);
}

if (needFluxer && !process.env.FLUXER_TOKEN) {
  console.error(t('system.missingToken', { adapter: 'Fluxer' }));
  process.exit(1);
}

// Restore persisted reminders before any adapter starts listening
await reminderService.init();

// Eagerly load commands before any adapter starts listening
await getCommands();

// Create snapshot store (shared across all adapter services)
const snapshotStore = process.env.DATABASE_URL
  ? new PostgresGuildSnapshotStore()
  : new SqliteGuildSnapshotStore();

console.log(
  t('guildSnapshot.backend', { backend: process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite' })
);

// Start selected adapters and wire up snapshot services
if (needDiscord) {
  const discordClient = startDiscordBot();
  const aggregator = new DiscordGuildAggregator(discordClient);
  const service = new GuildSnapshotService(snapshotStore, aggregator);
  service.start();
}

if (needFluxer) {
  const fluxerClient = startFluxerBot();
  const aggregator = new FluxerGuildAggregator(fluxerClient);
  const service = new GuildSnapshotService(snapshotStore, aggregator);
  service.start();
}

console.log(t('system.allAdaptersConnected'));
