import type { BotCommand } from '../../types.js';

export const CoinflipCommand: BotCommand = {
  name: 'coinflip',
  description: 'Flips a coin — 50/50 heads or tails.',
  category: 'social',
  async execute(message, _args) {
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    await message.reply(`🪙 The coin lands on... **${result}**!`);
  },
};
