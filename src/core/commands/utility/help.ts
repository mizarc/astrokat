import { t } from '../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../types.js';
import { getCommands } from '../../router.js';

const CATEGORY_ORDER = ['automation', 'knowledge', 'social', 'utility'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  automation: '⚙️ Automation',
  knowledge: '📚 Knowledge',
  social: '🎮 Social',
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

    const categories = new Map<string, BotCommand[]>();

    for (const [, cmd] of allCommands) {
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
        lines.push(
          `　\`!${cmd.name}\` — ${cmd.description}`,
        );
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
