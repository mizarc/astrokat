import { t } from './i18n.js';
import type { BotCommand, UnifiedMessage } from './types.js';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, extname } from 'path';
import { xpService } from './services/xp/xpService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const commandsDir = join(__dirname, 'commands');

async function loadCommands(): Promise<Map<string, BotCommand>> {
  const commands = new Map<string, BotCommand>();
  
  async function loadFromDirectory(dirPath: string): Promise<void> {
    const files = readdirSync(dirPath);

    for (const file of files) {
      const filePath = join(dirPath, file);
      const stat = statSync(filePath);
      
      // Recursively load from subdirectories
      if (stat.isDirectory()) {
        await loadFromDirectory(filePath);
        continue;
      }

      // Skip test files and non-TS/JS files
      const ext = extname(file);
      if ((ext !== '.ts' && ext !== '.js') || file.endsWith('.test.ts') || file.endsWith('.test.js')) {
        continue;
      }

      try {
        const fileUrl = pathToFileURL(filePath).href;
        const module = await import(fileUrl);
        
        // Look for exported command following the pattern: [Name]Command
        const commandName = file.replace(/\.(ts|js)$/, '');
        const exportKey = `${commandName.charAt(0).toUpperCase()}${commandName.slice(1)}Command`;
        
        const command = module[exportKey];
        if (command && command.name) {
          commands.set(command.name, command);
          console.log(t('system.loadedCommand', { name: command.name, category: command.category }));
        }
      } catch (error) {
        console.error(t('system.failedLoadCommand', { file }), error);
      }
    }
  }

  await loadFromDirectory(commandsDir);
  return commands;
}

/** Eagerly load all commands at import time (before bot starts listening). */
let commandsPromise: Promise<Map<string, BotCommand>> | null = null;

/**
 * Returns all loaded commands.
 * Lazily triggers loading on first call.
 */
export function getCommands(): Promise<Map<string, BotCommand>> {
  if (!commandsPromise) {
    commandsPromise = loadCommands();
  }
  return commandsPromise;
}

/**
 * The Router: Now handles both text-based parsing and pre-parsed slash commands.
 */
export async function handleIncomingMessage(
  message: UnifiedMessage, 
  isSlashCommand: boolean = false
) {
  let commandName = '';
  let args: string[] = [];

  if (isSlashCommand) {
    // Slash command: Extract command name and arguments from interaction options.
    commandName = message.interaction?.commandName.toLowerCase() || '';
    if (message.interaction?.options) {
      args = message.interaction.options.data.map(opt => opt.value?.toString() || '').filter(v => v);
    }
  } else {
    // Legacy Command: Strip the prefix and parse the command.
    const PREFIX = '!';
    if (!message.content.startsWith(PREFIX)) return;
    const content = message.content.slice(1).trim().split(/ +/);
    commandName = content.shift() || '';
    args = content.length ? content : [];
  }

  if (!commandName) return;
  const allCommands = await getCommands();
  const command = allCommands.get(commandName);

  if (command) {
    console.log(t('system.executingCommand', { commandName, type: isSlashCommand ? 'Slash' : 'Text' }));
    await command.execute(message, args);
  } else {
    // Only reply if it was a text command (don't clutter Discord slash UI)
    if (!isSlashCommand) await message.reply(t('system.commandNotFound'));
  }
}

/**
 * Award XP for sending messages.
 * Call this from adapters for every incoming message in a guild.
 * The 60-second cooldown is handled internally by xpService.
 */
export async function awardMessageXp(message: UnifiedMessage): Promise<void> {
  if (!message.guildId) return;

  const result = await xpService.awardXp(
    message.guildId, message.author.id, message.platform, message.content,
  );

  if (result.levelUp && result.xpNotifications) {
    const guildConfig = await xpService.getGuildConfig(message.guildId);
    if (guildConfig.levelUpMessages) {
      await message.reply(t('commands.xp.levelUp', {
        level: result.levelUp.newLevel,
      }));
    }
  }
}