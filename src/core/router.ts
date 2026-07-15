import { t } from './i18n.js';
import type { BotCommand, UnifiedMessage } from './types.js';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, extname } from 'path';
import { xpService } from './services/xp/xpService.js';
import { rateLimiter } from './services/ratelimit/rateLimiter.js';
import { guildConfigService } from './services/guildconfig/guildConfigService.js';
import { defaultPrefix } from './services/guildconfig/guildConfigStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const commandsDir = join(__dirname, 'commands');

/** Escape regex special characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
      if (
        (ext !== '.ts' && ext !== '.js') ||
        file.endsWith('.test.ts') ||
        file.endsWith('.test.js')
      ) {
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
          console.log(
            t('system.loadedCommand', { name: command.name, category: command.category })
          );
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

// Wire up the rate limiter's per-guild override provider.
// Fetches guild config from the guild config store.
rateLimiter.setGuildConfigProvider(async (guildId) => {
  const config = await guildConfigService.get(guildId);
  return {
    userMaxCommands: config.rateLimitUserMax ?? null,
    guildMaxCommands: config.rateLimitGuildMax ?? null,
  };
});

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
      const data = message.interaction.options.data;
      // Detect subcommand (type 1 = SUB_COMMAND) and prepend its name to args
      const subCommand = data.find((opt) => opt.type === 1);
      if (subCommand) {
        args = [
          subCommand.name,
          ...(subCommand.options?.map((o) => o.value?.toString() || '').filter((v) => v) ?? []),
        ];
      } else {
        args = data.map((opt) => opt.value?.toString() || '').filter((v) => v);
      }
    }
  } else {
    // Legacy Command: Parse the message.
    // First, check for mention-based invocation (@Bot command args).
    // This avoids conflicts with other bots sharing the same prefix.
    let content = message.content;
    const guildConfig = message.guildId ? await guildConfigService.get(message.guildId) : null;

    if (message.botUserId) {
      const mentionPattern = new RegExp(`^<@!?${escapeRegex(message.botUserId)}>\\s*(.*)$`);
      const mentionMatch = content.match(mentionPattern);
      if (mentionMatch) {
        content = mentionMatch[1]!.trim();
      }
    }

    // If not a mention invocation, check the prefix
    const prefix = guildConfig?.prefix ?? defaultPrefix;
    if (content === message.content) {
      if (!content.startsWith(prefix)) return;
      content = content.slice(prefix.length).trim();
    }

    const parts = content.split(/ +/);
    commandName = parts.shift() || '';
    args = parts.length ? parts : [];
  }

  if (!commandName) return;
  const allCommands = await getCommands();
  const command = allCommands.get(commandName);

  if (command) {
    console.log(
      t('system.executingCommand', { commandName, type: isSlashCommand ? 'Slash' : 'Text' })
    );

    // Rate limit check (only in guilds)
    // Bot operators bypass all rate limits entirely.
    const isOperator = (process.env.BOT_OPERATOR_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(message.author.id);

    if (message.guildId && !isOperator) {
      const canManage = (await message.channel.userCanManageGuild?.()) ?? false;
      const result = await rateLimiter.check(message.guildId, message.author.id, canManage);
      if (!result.allowed) {
        const key = result.reason === 'user' ? 'system.rateLimitedUser' : 'system.rateLimitedGuild';
        await message.reply(t(key, { retryAfter: Math.ceil(result.retryAfter / 1000) }));
        return;
      }
    }

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
    message.guildId,
    message.author.id,
    message.platform,
    message.content
  );

  if (result.levelUp && result.xpNotifications) {
    const guildConfig = await guildConfigService.get(message.guildId);
    if (guildConfig.levelUpMessages) {
      await message.reply(
        t('commands.xp.levelUp', {
          level: result.levelUp.newLevel,
        })
      );
    }
  }
}
