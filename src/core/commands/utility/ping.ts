import type { BotCommand } from '../../types.js';

export const PingCommand: BotCommand = {
  name: 'ping',
  description: 'Checks the bot connectivity. Responds with pong.',
  category: 'utility',
  async execute(message) {
    await message.reply('Pong!');
  }
};
