import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

export const BeanCommand: BotCommand = {
  name: 'bean',
  description: 'Fake-ban a user with the mighty power of the bean!',
  category: 'social',
  parameters: [
    { name: 'user', description: 'The user to bean', type: 'user', required: true },
    { name: 'reason', description: 'The reason for the bean', type: 'string', required: false },
  ],
  async execute(message, args) {
    if (args.length === 0) {
      await message.reply(t('commands.bean.userRequired'));
      return;
    }

    const targetId = args[0]!.replace(/[<@!>]/g, '');
    const reason = args.slice(1).join(' ') || 'No reason provided';

    await message.reply(
      t('commands.bean.result', { user: `<@${targetId}>`, id: targetId, reason }),
    );
  },
};
