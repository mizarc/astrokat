import type { BotCommand, UnifiedMessage } from './types.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, extname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const commandsDir = join(__dirname, 'commands');

async function loadCommands(): Promise<Map<string, BotCommand>> {
  const commands = new Map<string, BotCommand>();
  const files = readdirSync(commandsDir).filter(
    (file) => extname(file) === '.ts' && file !== 'index.ts'
  );

  for (const file of files) {
    const filePath = join(commandsDir, file);
    const fileUrl = pathToFileURL(filePath).href;
    
    try {
      const module = await import(fileUrl);
      // Look for exported command following the pattern: [Name]Command
      const commandName = file.replace('.ts', '');
      const exportKey = `${commandName.charAt(0).toUpperCase()}${commandName.slice(1)}Command`;
      
      const command = module[exportKey];
      if (command && command.name) {
        commands.set(command.name, command);
        console.log(`Loaded command: ${command.name}`);
      }
    } catch (error) {
      console.error(`Failed to load command from ${file}:`, error);
    }
  }

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