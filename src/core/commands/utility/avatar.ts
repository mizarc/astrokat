import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

/**
 * Extracts a Discord user ID from a mention string like <@123> or <@!123>.
 */
function parseMention(text: string): string | null {
  const match = text.match(/^<@!?(\d+)>$/);
  return match ? match[1] ?? null : null;
}

export const AvatarCommand: BotCommand = {
  name: 'avatar',
  description: 'Shows a user\'s profile avatar.',
  category: 'utility',
  async execute(message, args) {
    let targetUserId = message.userId;
    let targetUsername = message.username;
    let avatarUrl = message.avatarUrl;

    // Check if a mention was provided
    const mentionArg = args[0];
    if (mentionArg) {
      const mentionedId = parseMention(mentionArg);
      if (mentionedId && message.fetchUser) {
        const user = await message.fetchUser(mentionedId);
        if (user) {
          targetUserId = mentionedId;
          targetUsername = user.username;
          avatarUrl = user.avatarUrl;
        }
      }
    }

    if (!avatarUrl) {
      await message.reply(t('commands.avatar.notFound'));
      return;
    }

    await message.reply(avatarUrl);
  },
};
