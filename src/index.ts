import { t } from './core/i18n.js';
import { startDiscordBot } from './adapters/discord.js';
import { startFluxerBot } from './adapters/fluxer.js';
import { reminderService } from './core/services/reminders/reminderService.js';

console.log(t('system.starting'));

// Validate tokens
if (!process.env.DISCORD_TOKEN || !process.env.FLUXER_TOKEN) {
  console.error(t('system.missingTokens'));
  process.exit(1);
}

// Restore persisted reminders before any adapter starts listening
await reminderService.init();

// Start multiple adapters
startDiscordBot();
startFluxerBot();

console.log(t('system.allAdaptersConnected'));  