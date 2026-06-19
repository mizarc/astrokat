import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';
import { xpService } from '../../services/xp/xpService.js';
import { guildConfigService } from '../../services/guildconfig/guildConfigService.js';

export const XpCommand: BotCommand = {
  name: 'xp',
  description: 'XP and leveling system management.',
  category: 'administration',
  parameters: [
    {
      name: 'subcommand',
      description: 'Subcommand: set, add, globalnotify, bonus',
      type: 'string',
      required: true,
    },
    { name: 'target', description: 'User mention/ID or on/off', type: 'string', required: false },
    {
      name: 'value',
      description: 'XP amount, keyword, or on/off',
      type: 'string',
      required: false,
    },
    {
      name: 'keyword_amount',
      description: 'XP amount for keyword bonus',
      type: 'integer',
      required: false,
    },
  ],
  async execute(message, args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('commands.xp.guildOnly'));
      return;
    }

    const sub = args[0]?.toLowerCase();

    // Show help if no subcommand
    if (!sub) {
      await message.reply({
        content: '',
        embeds: [
          {
            title: t('commands.xp.helpTitle'),
            description: t('commands.xp.helpDescription'),
            color: 0x5865f2,
          },
        ],
      });
      return;
    }

    switch (sub) {
      // Global notify subcommand
      case 'globalnotify':
        return handleGlobalNotify(message, args.slice(1));

      // Set subcommand
      case 'set':
        return handleSet(message, args.slice(1));

      // Add subcommand
      case 'add':
        return handleAdd(message, args.slice(1));

      // Bonus subcommand
      case 'bonus':
        return handleBonus(message, args.slice(1));

      default:
        await message.reply(t('commands.xp.unknownSubcommand', { sub }));
    }
  },
};

async function handleGlobalNotify(message: any, args: string[]) {
  const guildId = message.guildId!;
  const config = await guildConfigService.get(guildId);

  if (args.length === 0) {
    const status = config.levelUpMessages ? t('commands.xp.enabled') : t('commands.xp.disabled');
    await message.reply(t('commands.xp.globalnotifyCurrent', { status }));
    return;
  }

  const arg = args[0]!.toLowerCase();
  if (arg !== 'on' && arg !== 'off') {
    await message.reply(t('commands.xp.invalidToggle'));
    return;
  }

  // Check permissions for toggling
  if (message.channel?.userCanManageMessages) {
    const hasPerms = await message.channel.userCanManageMessages();
    if (!hasPerms) {
      await message.reply(t('commands.xp.noPermission'));
      return;
    }
  }

  const enabled = arg === 'on';
  if (enabled === config.levelUpMessages) {
    const status = t(`commands.xp.${enabled ? 'enabled' : 'disabled'}`);
    await message.reply(t('commands.xp.globalnotifyNoChange', { status }));
    return;
  }

  await guildConfigService.set(guildId, { levelUpMessages: enabled });
  const status = t(`commands.xp.${enabled ? 'enabled' : 'disabled'}`);
  await message.reply(t('commands.xp.globalnotifyUpdated', { status }));
}

async function handleSet(message: any, args: string[]) {
  // Permission check
  if (!(await isAdmin(message))) return;

  const userId = extractUserId(message, args[0]);
  if (!userId) {
    await message.reply(t('commands.xp.setUsage'));
    return;
  }

  const amount = parseInt(args[1] ?? '', 10);
  if (isNaN(amount) || amount < 0) {
    await message.reply(t('commands.xp.invalidAmount'));
    return;
  }

  const result = await xpService.setXpDirect(message.guildId!, userId, message.platform, amount);

  await message.reply(
    t('commands.xp.setResult', {
      userId,
      xp: String(result.xp),
      level: String(result.level),
    })
  );
}

async function handleAdd(message: any, args: string[]) {
  // Permission check
  if (!(await isAdmin(message))) return;

  const userId = extractUserId(message, args[0]);
  if (!userId) {
    await message.reply(t('commands.xp.addUsage'));
    return;
  }

  const amount = parseInt(args[1] ?? '', 10);
  if (isNaN(amount) || amount <= 0) {
    await message.reply(t('commands.xp.invalidAmount'));
    return;
  }

  const result = await xpService.addXpDirect(message.guildId!, userId, message.platform, amount);

  await message.reply(
    t('commands.xp.addResult', {
      userId,
      amount: String(amount),
      xp: String(result.xp),
      level: String(result.level),
    })
  );
}

async function handleBonus(message: any, args: string[]) {
  const sub = args[0]?.toLowerCase();
  const guildId = message.guildId!;

  if (!sub || sub === 'list') {
    // List all keyword bonuses
    const bonuses = await xpService.listKeywordBonuses(guildId);
    if (bonuses.length === 0) {
      await message.reply(t('commands.xp.bonusNoBonuses'));
      return;
    }

    const lines = bonuses.map((b) =>
      t('commands.xp.bonusEntry', { keyword: b.keyword, xpAmount: String(b.xpAmount) })
    );
    await message.reply(t('commands.xp.bonusList', { list: lines.join('\n') }));
    return;
  }

  // Admin-only subcommands
  if (!(await isAdmin(message))) return;

  if (sub === 'add') {
    const keyword = args[1]?.toLowerCase();
    const amount = parseInt(args[2] ?? '', 10);
    if (!keyword || isNaN(amount) || amount <= 0) {
      await message.reply(t('commands.xp.bonusAddUsage'));
      return;
    }
    await xpService.setKeywordBonus(guildId, keyword, amount);
    await message.reply(t('commands.xp.bonusAdded', { keyword, xpAmount: String(amount) }));
    return;
  }

  if (sub === 'remove') {
    const keyword = args[1]?.toLowerCase();
    if (!keyword) {
      await message.reply(t('commands.xp.bonusRemoveUsage'));
      return;
    }
    await xpService.removeKeywordBonus(guildId, keyword);
    await message.reply(t('commands.xp.bonusRemoved', { keyword }));
    return;
  }

  await message.reply(t('commands.xp.unknownSubcommand', { sub }));
}

/** Check if the message author has Manage Messages permissions. */
async function isAdmin(message: any): Promise<boolean> {
  if (message.channel?.userCanManageMessages) {
    const hasPerms = await message.channel.userCanManageMessages();
    if (!hasPerms) {
      await message.reply(t('commands.xp.noPermission'));
      return false;
    }
  }
  // If the platform doesn't expose permissions, fall through (allow)
  return true;
}

/** Extract a user ID from an argument that may be a mention like <@123> or raw ID. */
function extractUserId(message: any, arg: string | undefined): string | null {
  if (!arg) return null;
  const cleaned = arg.replace(/[<@!>]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  return cleaned;
}
