import { t } from '../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../types.js';
import { repService } from '../../services/rep/repService.js';

export const RepCommand: BotCommand = {
  name: 'rep',
  description: 'Give a reputation point to someone, or check your own rep.',
  category: 'social',
  parameters: [
    {
      name: 'user',
      description: 'The user to give rep to (leave blank to check your own)',
      type: 'user',
      required: false,
    },
  ],
  async execute(message, args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('commands.rep.guildOnly'));
      return;
    }

    // No args — show own rep
    if (args.length === 0) {
      await showOwnRep(message, guildId);
      return;
    }

    // Parse the target user from args
    const cleaned = args[0]!.replace(/[<@!>]/g, '');
    let targetUserId = cleaned;
    let targetUsername = cleaned;
    let targetIsBot = false;

    if (message.fetchUser) {
      try {
        const user = await message.fetchUser(cleaned);
        if (user) {
          targetUserId = cleaned;
          targetUsername = user.username;
          targetIsBot = user.bot ?? false;
        }
      } catch {
        // fall back to raw ID
      }
    }

    // Self-rep check
    if (targetUserId === message.author.id) {
      await showOwnRep(message, guildId);
      return;
    }

    // Bot-Rep check
    if (targetIsBot) {
      await message.reply(t('commands.rep.botRep'));
      return;
    }

    // Give Rep via service
    const result = await repService.giveRep(
      guildId,
      message.author.id,
      targetUserId,
      message.platform
    );

    if (result.awarded) {
      const embed: ReplyEmbed = {
        title: t('commands.rep.givenTitle'),
        description: t('commands.rep.givenDescription', {
          giver: message.author.username,
          receiver: targetUsername,
          rep: String(result.totalRep),
        }),
        color: 0x57f287,
      };
      await message.reply({ content: '', embeds: [embed] });
      return;
    }

    // Handle rejection reasons
    switch (result.reason) {
      case 'self_rep':
        await showOwnRep(message, guildId);
        break;

      case 'daily_allowance_exhausted': {
        await message.reply(t('commands.rep.dailyAllowanceExhausted'));
        break;
      }

      case 'target_lockout': {
        const remaining = formatDuration(result.lockoutRemaining!);
        await message.reply(t('commands.rep.targetLockout', { time: remaining }));
        break;
      }
    }
  },
};

/**
 * Show the caller's own rep score.
 */
async function showOwnRep(message: any, guildId: string): Promise<void> {
  const entry = await repService.getEntry(guildId, message.author.id);
  const rank = await repService.getUserRank(guildId, message.author.id);
  const memberCount = await repService.getMemberCount(guildId);

  const rep = entry?.rep ?? 0;
  const rankStr =
    rank != null
      ? t('commands.rep.rankPosition', { rank: String(rank), total: String(memberCount) })
      : t('commands.rep.noRep');

  const embed: ReplyEmbed = {
    title: t('commands.rep.title', { username: message.author.username }),
    description: t('commands.rep.score', { rep: String(rep) }) + '\n' + rankStr,
    color: 0xf1c40f,
  };

  await message.reply({ content: '', embeds: [embed] });
}

/**
 * Format a duration (in ms) into a human-readable string.
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(t('commands.rep.cooldownDays', { days: String(days) }));
  if (hours > 0) parts.push(t('commands.rep.cooldownHours', { hours: String(hours) }));
  if (minutes > 0) parts.push(t('commands.rep.cooldownMinutes', { minutes: String(minutes) }));
  if (seconds > 0 || parts.length === 0)
    parts.push(t('commands.rep.cooldownSeconds', { seconds: String(seconds) }));

  return parts.join(' ');
}
