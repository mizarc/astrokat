import { t } from '../../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../../types.js';
import { handlePrefix } from './subcommands/prefix.js';
import { handleCommands } from './subcommands/commands.js';
import { handleFeatures } from './subcommands/features.js';
import { handleClear } from './subcommands/clear.js';

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
    {
      name: 'commands',
      description: 'List or toggle individual command availability.',
      subcommands: [
        {
          name: 'list',
          description: 'Show all commands with their enabled/disabled status.',
        },
        {
          name: 'enable',
          description: 'Enable a previously disabled command.',
          parameters: [
            {
              name: 'name',
              description: 'The command name to enable.',
              type: 'string',
              required: true,
            },
          ],
        },
        {
          name: 'disable',
          description: 'Disable a command in this server.',
          parameters: [
            {
              name: 'name',
              description: 'The command name to disable.',
              type: 'string',
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: 'features',
      description: 'Enable or disable data-storing features (XP, rep).',
      subcommands: [
        {
          name: 'list',
          description: 'Show all features and their current status.',
        },
        {
          name: 'enable',
          description: 'Enable a feature (xp, rep).',
          parameters: [
            {
              name: 'name',
              description: 'Feature name: xp or rep.',
              type: 'string',
              required: true,
            },
          ],
        },
        {
          name: 'disable',
          description: 'Disable a feature (xp, rep).',
          parameters: [
            {
              name: 'name',
              description: 'Feature name: xp or rep.',
              type: 'string',
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: 'clear',
      description: 'Clear stored data for this server (xp, rep, roles, or everything).',
      parameters: [
        {
          name: 'target',
          description: 'What to clear: xp, rep, roles, all',
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
          `\`!settings commands\` — ${t('commands.settings.commands.helpDescription')}`,
          `\`!settings features\` — ${t('commands.settings.features.helpDescription')}`,
          `\`!settings clear\` — ${t('commands.settings.clear.helpDescription')}`,
        ].join('\n'),
        footer: { text: t('commands.settings.help.footer') },
      };
      await message.reply({ content: '', embeds: [embed] });
      return;
    }

    // Check Manage Guild permission for mutating subcommands (view-only ones are fine)
    const needsPermission = ['commands', 'features', 'clear'].includes(subcommand);
    if (needsPermission && message.channel?.userCanManageGuild) {
      const allowed = await message.channel.userCanManageGuild();
      if (!allowed) {
        await message.reply(t('commands.settings.noPermission'));
        return;
      }
    }

    switch (subcommand) {
      case 'prefix':
        await handlePrefix(message, guildId, args.slice(1));
        break;
      case 'commands':
        await handleCommands(message, guildId, args.slice(1));
        break;
      case 'features':
        await handleFeatures(message, guildId, args.slice(1));
        break;
      case 'clear':
        await handleClear(message, guildId, args.slice(1));
        break;
      default:
        await message.reply(t('commands.settings.unknownSubcommand', { sub: subcommand }));
    }
  },
};
