import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

export const PingCommand: BotCommand = {
  name: 'ping',
  description: 'Checks the bot connectivity and latency.',
  category: 'utility',
  async execute(message) {
    const startTime = performance.now();
    await message.reply(t('commands.ping.calculating'));
    const latency = Math.round(performance.now() - startTime);
    await message.edit(t('commands.ping.result', { latency }));
  }
};
