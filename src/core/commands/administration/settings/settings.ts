import { t } from '../../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../../types.js';
import { handlePrefix } from './subcommands/prefix.js';

export const SettingsCommand: BotCommand = {
  name: 'settings',
  description: 'View or change guild-level bot settings.',
  category: 'administration',
  subcommands: [
    {
      name: 'prefix',
      description: 'View or change the command prefix for this server.',
      parameters: [
        {
          name: 'action',
          description: 'Subcommand: set <prefix>, reset, or leave empty to view',
          type: 'string',
          required: false,
        },
        {
          name: 'value',
          description: 'The new prefix (required for set)',
          type: 'string',
          required: false,
        },
      ],
    },
  ],
  async execute(message, args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('commands.settings.guildOnly'));
      return;
    }

    const subcommand = args[0]?.toLowerCase();

    if (!subcommand) {
      const embed: ReplyEmbed = {
        title: t('commands.settings.help.title'),
        color: 0x5865f2,
        description: [
          `\`!settings prefix\` — ${t('commands.settings.prefix.helpDescription')}`,
        ].join('\n'),
        footer: { text: t('commands.settings.help.footer') },
      };
      await message.reply({ content: '', embeds: [embed] });
      return;
    }

    switch (subcommand) {
      case 'prefix':
        await handlePrefix(message, guildId, args.slice(1));
        break;
      default:
        await message.reply(t('commands.settings.unknownSubcommand', { sub: subcommand }));
    }
  },
};
