import { startDiscordBot } from './adapters/discord.js';
import { startFluxerBot } from './adapters/fluxer.js';
import { reminderService } from './core/services/reminders/reminderService.js';

console.log("Spacecat is starting...");

// Validate tokens
if (!process.env.DISCORD_TOKEN || !process.env.FLUXER_TOKEN) {
  console.error("Missing required tokens in .env");
  process.exit(1);
}

// Restore persisted reminders before any adapter starts listening
await reminderService.init();

// Start multiple adapters
startDiscordBot();
startFluxerBot();

console.log("All adapters connected.");  