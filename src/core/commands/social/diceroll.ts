import type { BotCommand } from '../../types.js';

export const DicerollCommand: BotCommand = {
  name: 'diceroll',
  description: 'Rolls a die with a configurable number of sides.',
  category: 'social',
  async execute(message, args) {
    let sides = 6;

    if (args[0]) {
      const parsed = parseInt(args[0], 10);
      if (!isNaN(parsed) && parsed > 0) {
        sides = parsed;
      }
    }

    const result = Math.floor(Math.random() * sides) + 1;
    await message.reply(`🎲 You rolled a ${result}!`);
  },
};
