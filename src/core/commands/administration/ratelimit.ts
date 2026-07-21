import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';
import { rateLimiter } from '../../services/ratelimit/rateLimiter.js';
import { guildConfigService } from '../../services/guildconfig/guildConfigService.js';

export const RatelimitCommand: BotCommand = {
  name: 'ratelimit',
  description: 'View or configure per-guild rate limits.',
  category: 'administration',
  subcommands: [
    {
      name: 'view',
      description: 'Show current effective rate limits for this server.',
    },
    {
      name: 'user',
      description: 'Set the per-user rate limit for this server.',
      parameters: [
        {
          name: 'limit',
          description: 'Max commands per user per minute.',
          type: 'integer',
          required: true,
        },
      ],
    },
    {
      name: 'guild',
      description: 'Set the per-guild rate limit for this server.',
      parameters: [
        {
          name: 'limit',
          description: 'Max commands per guild per minute.',
          type: 'integer',
          required: true,
        },
      ],
    },
    {
      name: 'reset',
      description: 'Reset all rate limit overrides to environment defaults.',
    },
  ],
  async execute(message, args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('commands.ratelimit.guildOnly'));
      return;
    }

    const action = args[0]?.toLowerCase();

    // No args or 'view' — show current effective limits
    if (!action || action === 'view') {
      return showCurrentLimits(message, guildId);
    }

    // Mutating actions require Manage Guild permission
    if (message.channel?.userCanManageGuild) {
      const allowed = await message.channel.userCanManageGuild();
      if (!allowed) {
        await message.reply(t('commands.ratelimit.noPermission'));
        return;
      }
    }

    switch (action) {
      case 'user':
        return setUserLimit(message, guildId, args[1]);
      case 'guild':
        return setGuildLimit(message, guildId, args[1]);
      case 'reset':
        return resetLimits(message, guildId);
      default:
        await message.reply(t('commands.ratelimit.unknownAction', { action }));
    }
  },
};

async function showCurrentLimits(message: any, guildId: string): Promise<void> {
  const config = await guildConfigService.get(guildId);
  const defaults = rateLimiter.getEffectiveDefaults();

  // Resolve effective values: guild override ?? platform-wide default
  const effectiveUser = config.rateLimitUserMax ?? defaults.userMaxCommands;
  const effectiveGuild = config.rateLimitGuildMax ?? defaults.guildMaxCommands;

  const userSource =
    config.rateLimitUserMax != null
      ? t('commands.ratelimit.sourceOverride')
      : t('commands.ratelimit.sourceEnv');
  const guildSource =
    config.rateLimitGuildMax != null
      ? t('commands.ratelimit.sourceOverride')
      : t('commands.ratelimit.sourceEnv');

  await message.reply({
    content: '',
    embeds: [
      {
        title: t('commands.ratelimit.embedTitle'),
        color: 0x5865f2,
        fields: [
          {
            name: t('commands.ratelimit.fieldUser'),
            value: t('commands.ratelimit.fieldValue', { limit: effectiveUser, source: userSource }),
            inline: true,
          },
          {
            name: t('commands.ratelimit.fieldGuild'),
            value: t('commands.ratelimit.fieldValue', {
              limit: effectiveGuild,
              source: guildSource,
            }),
            inline: true,
          },
          {
            name: t('commands.ratelimit.fieldWindow'),
            value: t('commands.ratelimit.fieldWindowValue', { seconds: 60 }),
            inline: false,
          },
        ],
        footer: { text: t('commands.ratelimit.footer') },
      },
    ],
  });
}

async function setUserLimit(
  message: any,
  guildId: string,
  valueStr: string | undefined
): Promise<void> {
  const value = parseInt(valueStr ?? '', 10);
  if (isNaN(value) || value < 1) {
    await message.reply(t('commands.ratelimit.invalidValue'));
    return;
  }

  // Cap per-guild overrides at the platform-wide maximum
  const defaults = rateLimiter.getEffectiveDefaults();
  if (value > defaults.userMaxCommands) {
    await message.reply(t('commands.ratelimit.tooHighUser', { limit: defaults.userMaxCommands }));
    return;
  }

  await guildConfigService.set(guildId, { rateLimitUserMax: value });
  // Reset in-memory buckets so the new limit takes effect immediately
  rateLimiter.reset();
  await message.reply(t('commands.ratelimit.updatedUser', { limit: value }));
}

async function setGuildLimit(
  message: any,
  guildId: string,
  valueStr: string | undefined
): Promise<void> {
  const value = parseInt(valueStr ?? '', 10);
  if (isNaN(value) || value < 1) {
    await message.reply(t('commands.ratelimit.invalidValue'));
    return;
  }

  // Cap per-guild overrides at the platform-wide maximum
  const defaults = rateLimiter.getEffectiveDefaults();
  if (value > defaults.guildMaxCommands) {
    await message.reply(t('commands.ratelimit.tooHighGuild', { limit: defaults.guildMaxCommands }));
    return;
  }

  await guildConfigService.set(guildId, { rateLimitGuildMax: value });
  rateLimiter.reset();
  await message.reply(t('commands.ratelimit.updatedGuild', { limit: value }));
}

async function resetLimits(message: any, guildId: string): Promise<void> {
  await guildConfigService.set(guildId, { rateLimitUserMax: null, rateLimitGuildMax: null });
  rateLimiter.reset();
  await message.reply(t('commands.ratelimit.updatedReset'));
}
