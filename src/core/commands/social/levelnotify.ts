import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';
import { xpService } from '../../services/xp/xpService.js';

export const LevelnotifyCommand: BotCommand = {
  name: 'levelnotify',
  description: 'Check or toggle your level-up notifications.',
  category: 'social',
  parameters: [
    {
      name: 'setting',
      description: '`on` to enable, `off` to disable, or leave empty to check',
      type: 'string', required: false,
    },
  ],
  async execute(message, args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('commands.levelnotify.guildOnly'));
      return;
    }

    const entry = await xpService.getEntry(guildId, message.author.id);
    const current = entry?.xpNotifications ?? true;
    const arg = args[0]?.toLowerCase();

    // No argument — show current status
    if (!arg) {
      const statusKey = current ? 'commands.levelnotify.enabled' : 'commands.levelnotify.disabled';
      const status = t(statusKey);
      await message.reply(t('commands.levelnotify.currentStatus', { status }));
      return;
    }

    if (arg !== 'on' && arg !== 'off') {
      await message.reply(t('commands.levelnotify.invalidToggle'));
      return;
    }

    const enabled = arg === 'on';
    if (enabled === current) {
      const status = t(`commands.levelnotify.${enabled ? 'enabled' : 'disabled'}`);
      await message.reply(t('commands.levelnotify.noChange', { status }));
      return;
    }

    await xpService.setXpNotifications(guildId, message.author.id, enabled);
    const status = t(`commands.levelnotify.${enabled ? 'enabled' : 'disabled'}`);
    await message.reply(t('commands.levelnotify.updated', { status }));
  },
};
