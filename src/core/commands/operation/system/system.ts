import { t } from '../../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../../types.js';
import { handleRatelimit } from './subcommands/ratelimit.js';
import { handlePresence } from './subcommands/presence.js';
import { handleStatus } from './subcommands/status.js';
import { handleStats } from './subcommands/stats.js';

export const SystemCommand: BotCommand = {
  name: 'system',
  description: 'System administration commands (operator only).',
  category: 'operation',
  subcommands: [
    {
      name: 'ratelimit',
      description: 'View or set platform-wide rate limits (operator only).',
      parameters: [
        { name: 'user_limit', description: 'Per-user limit', type: 'integer', required: false },
        { name: 'guild_limit', description: 'Per-guild limit', type: 'integer', required: false },
      ],
    },
    {
      name: 'presence',
      description: "Changes the bot's online status (owner only).",
      parameters: [
        {
          name: 'status',
          description: 'One of: online, idle, dnd, invisible',
          type: 'string',
          required: true,
        },
      ],
    },
    {
      name: 'status',
      description: "Changes the bot's custom status (owner only).",
      parameters: [
        {
          name: 'text',
          description: 'Status text (optionally prefixed with an emoji)',
          type: 'string',
          required: true,
        },
      ],
    },
    {
      name: 'stats',
      description: 'View guild and member statistics with growth chart (operator only).',
    },
  ],
  async execute(message, args) {
    const subcommand = args[0]?.toLowerCase();

    if (!subcommand) {
      const embed: ReplyEmbed = {
        title: '🖥️ System',
        color: 0x5865f2,
        description: [
          '`!system ratelimit` — View or set platform-wide rate limits',
          '`!system presence` — Change bot presence (online/idle/dnd/invisible)',
          '`!system status` — Set custom bot status text',
          '`!system stats` — View guild & member statistics with growth chart',
        ].join('\n'),
        footer: {
          text: 'Use `!system <subcommand>` to run a command.',
        },
      };
      await message.reply({ content: '', embeds: [embed] });
      return;
    }

    switch (subcommand) {
      case 'ratelimit':
        await handleRatelimit(message, args.slice(1));
        break;
      case 'presence':
        await handlePresence(message, args.slice(1));
        break;
      case 'status':
        await handleStatus(message, args.slice(1));
        break;
      case 'stats':
        await handleStats(message, args.slice(1));
        break;
      default:
        await message.reply(
          `❌ Unknown subcommand \`${subcommand}\`. ` +
            'Available: `ratelimit`, `presence`, `status`, `stats`.'
        );
    }
  },
};
