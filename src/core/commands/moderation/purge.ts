import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export const PurgeCommand: BotCommand = {
  name: 'purge',
  description: 'Bulk delete messages in the current channel.',
  category: 'moderation',
  async execute(message, args) {
    const { canManageMessages, fetchMessages, bulkDelete } = message.channel;

    if (!canManageMessages || !fetchMessages || !bulkDelete) {
      await message.reply(t('commands.purge.notAvailable'));
      return;
    }

    // Check permission
    const hasPerms = await canManageMessages();
    if (!hasPerms) {
      await message.reply(t('commands.purge.botMissingPerms'));
      return;
    }

    // Parse args
    const amountStr = args[0];
    if (!amountStr) {
      await message.reply(t('commands.purge.invalidAmount'));
      return;
    }

    const amount = parseInt(amountStr, 10);

    if (isNaN(amount) || amount < 1) {
      await message.reply(t('commands.purge.invalidAmount'));
      return;
    }

    if (amount > 100) {
      await message.reply(t('commands.purge.tooMany'));
      return;
    }

    const targetUserId = args[1]?.replace(/[<@!>]/g, '');

    try {
      // Fetch messages, and fetch one extra to account for the command message being excluded
      const messages = await fetchMessages(amount + 1);

      if (messages.length === 0) {
        await message.reply(t('commands.purge.noMessages'));
        return;
      }

      let toDelete = messages.map((m) => m.id);

      if (targetUserId) {
        const filteredIds = messages
          .filter((m) => m.authorId === targetUserId)
          .map((m) => m.id);

        if (filteredIds.length === 0) {
          await message.reply(t('commands.purge.noMessages'));
          return;
        }

        // Check 14-day limit
        const now = Date.now();
        const fresh = messages.filter((m) => m.createdAt.getTime() > now - TWO_WEEKS_MS);
        const freshIds = fresh.map((m) => m.id);
        const oldCount = toDelete.length - freshIds.length;

        toDelete = filteredIds;
        // Only filter out old ones if bulkDelete will reject them
        // (Discord rejects messages older than 14 days)
        const deletable = freshIds.filter((id) => filteredIds.includes(id));

        if (deletable.length === 0) {
          await message.reply(t('commands.purge.noMessages'));
          return;
        }

        // Exclude command message
        const finalDeletable = deletable.filter((id) => id !== message.id);

        await bulkDelete(finalDeletable);

        const skipped = oldCount > 0
          ? t('commands.purge.skippedOldUser', { count: oldCount })
          : '';
        await message.reply(t('commands.purge.successUser', { count: finalDeletable.length }) + skipped);
      } else {
        // Exclude command message
        const toDeleteFiltered = toDelete.filter((id) => id !== message.id);

        if (toDeleteFiltered.length === 0) {
          await message.reply(t('commands.purge.noMessages'));
          return;
        }

        await bulkDelete(toDeleteFiltered);
        await message.reply(t('commands.purge.success', { count: toDeleteFiltered.length }));
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('403') || errMsg.includes('Missing Permissions') || errMsg.includes('MISSING_PERMISSIONS')) {
        await message.reply(t('commands.purge.botMissingPerms'));
      } else {
        await message.reply(t('commands.purge.error', { detail: errMsg }));
      }
    }
  },
};
