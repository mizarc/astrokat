import { t } from '../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../types.js';
import { xpService } from '../../services/xp/xpService.js';

export const LeaderboardCommand: BotCommand = {
  name: 'leaderboard',
  description: 'Shows the XP leaderboard for this server.',
  category: 'social',
  async execute(message, _args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('commands.leaderboard.guildOnly'));
      return;
    }

    const entries = await xpService.getLeaderboard(guildId, 10, 0);

    if (entries.length === 0) {
      await message.reply(t('commands.leaderboard.noData'));
      return;
    }

    // Resolve usernames for each entry
    const lines: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const rank = i + 1;
      let displayName = entry.userId;

      if (message.fetchUser) {
        try {
          const user = await message.fetchUser(entry.userId);
          if (user) {
            displayName = user.username;
          }
        } catch {
          // fall back to user ID
        }
      }

      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
      lines.push(
        t('commands.leaderboard.entry', {
          medal,
          name: escapeMarkdown(displayName),
          level: String(entry.level),
          xp: String(entry.xp),
        }),
      );
    }

    const embed: ReplyEmbed = {
      title: t('commands.leaderboard.title'),
      description: lines.join('\n'),
      color: 0xf1c40f,
      footer: { text: t('commands.leaderboard.footer') },
    };

    await message.reply({ content: '', embeds: [embed] });
  },
};

/** Minimal markdown escaping to prevent formatting exploits in display names. */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\_*~`|>]/g, '\\$&');
}
