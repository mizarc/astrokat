import { t } from '../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../types.js';
import { xpService, xpForLevel } from '../../services/xp/xpService.js';
import { repService } from '../../services/rep/repService.js';

export const ProfileCommand: BotCommand = {
  name: 'profile',
  description: "Shows your level, XP, and reputation — or another user's.",
  category: 'social',
  parameters: [
    {
      name: 'user',
      description: 'The user to look up (leave blank for yourself)',
      type: 'user',
      required: false,
    },
  ],
  async execute(message, args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('commands.profile.guildOnly'));
      return;
    }

    // Determine which user to look up
    let targetUserId = message.author.id;
    let targetUsername = message.author.username;
    let targetAvatarUrl: string | undefined = message.author.avatarUrl;

    if (args.length > 0 && message.fetchUser) {
      const cleaned = args[0]!.replace(/[<@!>]/g, '');
      const user = await message.fetchUser(cleaned);
      if (user) {
        targetUserId = cleaned;
        targetUsername = user.username;
        targetAvatarUrl = user.avatarUrl;
      } else {
        targetUserId = cleaned;
        targetUsername = cleaned;
      }
    }

    // Fetch XP data
    const xpEntry = await xpService.getEntry(guildId, targetUserId);
    const xpRank = await xpService.getUserRank(guildId, targetUserId);
    const memberCount = await xpService.getMemberCount(guildId);

    const level = xpEntry?.level ?? 1;
    const xp = xpEntry?.xp ?? 0;
    const currentLevelXp = xpForLevel(level);
    const nextLevelXp = xpForLevel(level + 1);
    const progress =
      nextLevelXp > currentLevelXp
        ? Math.round(((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100)
        : 100;

    // Build a visual progress bar (10 segments)
    const barLength = 10;
    const filled = Math.round((progress / 100) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barLength - filled));

    // Fetch rep data
    const repEntry = await repService.getEntry(guildId, targetUserId);
    const repRank = await repService.getUserRank(guildId, targetUserId);
    const rep = repEntry?.rep ?? 0;

    const description = [
      `## ${t('commands.profile.level', { level: String(level) })}`,
      '',
      t('commands.profile.xpProgress', { xp: String(xp), nextXp: String(nextLevelXp) }),
      t('commands.profile.progressBar', { bar, percent: String(progress) }),
      xpRank != null
        ? t('commands.profile.rankPosition', { rank: String(xpRank), total: String(memberCount) })
        : t('commands.profile.noXp'),
      '',
      t('commands.profile.repScore', { rep: String(rep) }),
      repRank != null
        ? t('commands.profile.repRankPosition', {
            rank: String(repRank),
            total: String(memberCount),
          })
        : t('commands.profile.noRep'),
    ].join('\n');

    const embed: ReplyEmbed = {
      title: t('commands.profile.title', { username: targetUsername }),
      description,
      color: xpEntry ? 0x5865f2 : 0x999999,
      ...(targetAvatarUrl && { thumbnail: { url: targetAvatarUrl } }),
    };

    await message.reply({ content: '', embeds: [embed] });
  },
};
