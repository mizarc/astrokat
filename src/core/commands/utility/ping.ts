import type { BotCommand } from '../../types.js';

export const PingCommand: BotCommand = {
  name: 'ping',
  description: 'Checks the bot connectivity and latency.',
  category: 'utility',
  async execute(message) {
    const startTime = performance.now();
    await message.reply('Calculating latency...');
    const latency = Math.round(performance.now() - startTime);
    await message.edit(`Pong! Bot latency is: **${latency}ms**`);
  }
};
