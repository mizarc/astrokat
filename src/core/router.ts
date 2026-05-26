import type { BotCommand, UnifiedMessage } from './types.js';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, extname } from 'path';

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

      // Skip test files and non-TS files
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) {
        continue;
      }

      try {
        const fileUrl = pathToFileURL(filePath).href;
        const module = await import(fileUrl);
        
        // Look for exported command following the pattern: [Name]Command
        const commandName = file.replace('.ts', '');
        const exportKey = `${commandName.charAt(0).toUpperCase()}${commandName.slice(1)}Command`;
        
        const command = module[exportKey];
        if (command && command.name) {
          commands.set(command.name, command);
          console.log(`Loaded command: ${command.name} (${command.category})`);
        }
      } catch (error) {
        console.error(`Failed to load command from ${file}:`, error);
      }
    }
  }

  await loadFromDirectory(commandsDir);
  return commands;
}

const commands = await loadCommands();

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
  const command = commands.get(commandName);

  if (command) {
    console.log(`Executing '${commandName}' via ${isSlashCommand ? 'Slash' : 'Text'} command.`);
    await command.execute(message, args);
  } else {
    // Only reply if it was a text command (don't clutter Discord slash UI)
    if (!isSlashCommand) await message.reply("Command not found.");
  }
}