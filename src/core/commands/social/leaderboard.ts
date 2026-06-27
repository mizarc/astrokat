import { t } from '../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../types.js';
import { xpService } from '../../services/xp/xpService.js';
import { repService } from '../../services/rep/repService.js';

export const LeaderboardCommand: BotCommand = {
  name: 'leaderboard',
  description: 'Shows the XP or reputation leaderboard for this server.',
  category: 'social',
  parameters: [
    {
      name: 'type',
      description: 'Leaderboard type — xp (default) or rep',
      type: 'string',
      required: false,
    },
  ],
  async execute(message, args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('commands.leaderboard.guildOnly'));
      return;
    }

    const type = args[0]?.toLowerCase() === 'rep' ? 'rep' : 'xp';

    if (type === 'rep') {
      const entries = await repService.getLeaderboard(guildId, 10, 0);

      if (entries.length === 0) {
        await message.reply(t('commands.leaderboard.noRepData'));
        return;
      }

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
          t('commands.leaderboard.entryRep', {
            medal,
            name: escapeMarkdown(displayName),
            rep: String(entry.rep),
          })
        );
      }

      const embed: ReplyEmbed = {
        title: t('commands.leaderboard.titleRep'),
        description: lines.join('\n'),
        color: 0xf1c40f,
        footer: { text: t('commands.leaderboard.footer') },
      };

      await message.reply({ content: '', embeds: [embed] });
      return;
    }

    // Default: XP leaderboard
    const entries = await xpService.getLeaderboard(guildId, 10, 0);

    if (entries.length === 0) {
      await message.reply(t('commands.leaderboard.noData'));
      return;
    }

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
        })
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
