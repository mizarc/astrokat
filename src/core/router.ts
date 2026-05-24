import type { BotCommand, UnifiedMessage } from './types.js';
import { PingCommand } from './commands/ping.js';
import { WikiCommand } from './commands/wiki.js';
import { ThesaurusCommand } from './commands/thesaurus.js';

const commands = new Map<string, BotCommand>();
commands.set(PingCommand.name, PingCommand);
commands.set(WikiCommand.name, WikiCommand);
commands.set(ThesaurusCommand.name, ThesaurusCommand);

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