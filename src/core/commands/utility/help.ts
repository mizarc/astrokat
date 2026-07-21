import { t } from '../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../types.js';
import { getCommands } from '../../router.js';
import { guildConfigService } from '../../services/guildconfig/guildConfigService.js';
import { guildDisabledCommandService } from '../../services/guildconfig/guildDisabledCommandService.js';
import { defaultPrefix } from '../../services/guildconfig/guildConfigStore.js';

const CATEGORY_ORDER = [
  'administration',
  'automation',
  'knowledge',
  'moderation',
  'social',
  'operation',
  'utility',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  administration: '🔐 Administration',
  automation: '⚙️ Automation',
  knowledge: '📚 Knowledge',
  moderation: '🛡️ Moderation',
  social: '🎮 Social',
  operation: '🛠️ Operation',
  utility: '🔧 Utility',
};

export const HelpCommand: BotCommand = {
  name: 'help',
  description: 'Shows all available commands.',
  category: 'utility',
  async execute(message, _args) {
    const allCommands = await getCommands();

    if (allCommands.size === 0) {
      await message.reply(t('commands.help.noCommands'));
      return;
    }

    const guildConfig = message.guildId ? await guildConfigService.get(message.guildId) : null;
    const prefix = guildConfig?.prefix ?? defaultPrefix;

    // Fetch which commands are disabled in this guild
    const disabledCommands = message.guildId
      ? new Set(await guildDisabledCommandService.getAll(message.guildId))
      : new Set<string>();

    const categories = new Map<string, BotCommand[]>();

    for (const [, cmd] of allCommands) {
      if (disabledCommands.has(cmd.name)) continue;
      const cat = cmd.category;
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(cmd);
    }

    const lines: string[] = [];

    for (const category of CATEGORY_ORDER) {
      const cmds = categories.get(category);
      if (!cmds || cmds.length === 0) continue;

      const label = CATEGORY_LABELS[category] ?? category;
      lines.push(`**${label}**`);
      for (const cmd of cmds) {
        lines.push(`\`${prefix}${cmd.name}\` — ${cmd.description}`);
      }
      lines.push('');
    }

    const embed: ReplyEmbed = {
      title: t('commands.help.title'),
      description: lines.join('\n').trimEnd(),
      color: 0x5865f2,
    };

    await message.reply({ content: '', embeds: [embed] });
  },
};
