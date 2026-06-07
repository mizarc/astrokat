import { t } from './core/i18n.js';
import { startDiscordBot } from './adapters/discord.js';
import { startFluxerBot } from './adapters/fluxer.js';
import { reminderService } from './core/services/reminders/reminderService.js';
import { getCommands } from './core/router.js';

console.log(t('system.starting'));

// Determine which adapters to start
const adapters = (process.env.ADAPTERS ?? 'discord,fluxer')
  .split(',')
  .map(a => a.trim().toLowerCase());

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

// Start selected adapters
if (needDiscord) startDiscordBot();
if (needFluxer) startFluxerBot();

console.log(t('system.allAdaptersConnected'));  