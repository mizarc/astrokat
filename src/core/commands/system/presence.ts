import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

const VALID_STATUSES = ['online', 'idle', 'dnd', 'invisible'] as const;

export const PresenceCommand: BotCommand = {
  name: 'presence',
  description: "Changes the bot's online status (owner only).",
  category: 'system',
  async execute(message, args) {
    const ownerIds = (process.env.BOT_OPERATOR_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (!ownerIds.includes(message.author.id)) {
      await message.reply(t('commands.presence.notOwner'));
      return;
    }

    if (args.length < 1) {
      await message.reply(t('commands.presence.usage'));
      return;
    }

    const raw = args[0]!;
    const status = raw.toLowerCase() as typeof VALID_STATUSES[number];

    if (!(VALID_STATUSES as readonly string[]).includes(status)) {
      await message.reply(t('commands.presence.invalid'));
      return;
    }

    if (!message.setPresence) {
      await message.reply(t('commands.presence.notAvailable'));
      return;
    }

    await message.setPresence(status);
    await message.reply(t('commands.presence.success', { status }));
  },
};
