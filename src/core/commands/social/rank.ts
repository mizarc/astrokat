import { t } from '../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../types.js';
import { xpService, xpForLevel } from '../../services/xp/xpService.js';

export const RankCommand: BotCommand = {
  name: 'rank',
  description: 'Shows your XP level and rank, or another user\'s.',
  category: 'social',
  parameters: [
    { name: 'user', description: 'The user to check (leave blank for yourself)', type: 'user', required: false },
  ],
  async execute(message, args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('commands.rank.guildOnly'));
      return;
    }

    // Determine which user to look up
    let targetUserId = message.author.id;
    let targetUsername = message.author.username;

    if (args.length > 0 && message.fetchUser) {
      const cleaned = args[0]!.replace(/[<@!>]/g, '');
      const user = await message.fetchUser(cleaned);
      if (user) {
        targetUserId = cleaned;
        targetUsername = user.username;
      } else {
        targetUserId = cleaned;
        targetUsername = cleaned;
      }
    }

    const entry = await xpService.getEntry(guildId, targetUserId);
    const rank = await xpService.getUserRank(guildId, targetUserId);
    const memberCount = await xpService.getMemberCount(guildId);

    const level = entry?.level ?? 1;
    const xp = entry?.xp ?? 0;
    const currentLevelXp = xpForLevel(level);
    const nextLevelXp = xpForLevel(level + 1);
    const progress = nextLevelXp > currentLevelXp
      ? Math.round(((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100)
      : 100;

    // Build a visual progress bar (10 segments)
    const barLength = 10;
    const filled = Math.round((progress / 100) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barLength - filled));

    const description = [
      t('commands.rank.level', { level: String(level) }),
      '',
      t('commands.rank.xpProgress', { xp: String(xp), nextXp: String(nextLevelXp) }),
      t('commands.rank.progressBar', { bar, percent: String(progress) }),
      '',
      rank != null
        ? t('commands.rank.rankPosition', { rank: String(rank), total: String(memberCount) })
        : t('commands.rank.noXp'),
    ].join('\n');

    const embed: ReplyEmbed = {
      title: t('commands.rank.title', { username: targetUsername }),
      description,
      color: entry ? 0x5865f2 : 0x999999,
    };

    await message.reply({ content: '', embeds: [embed] });
  },
};
