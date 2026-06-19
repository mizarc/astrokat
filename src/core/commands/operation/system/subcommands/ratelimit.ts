import { t } from '../../../../i18n.js';
import { rateLimiter } from '../../../../services/ratelimit/rateLimiter.js';
import type { UnifiedMessage } from '../../../../types.js';

function isOwner(message: { author: { id: string } }): boolean {
  const ownerIds = (process.env.BOT_OPERATOR_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ownerIds.includes(message.author.id);
}

export async function handleRatelimit(message: UnifiedMessage, args: string[]) {
  if (!isOwner(message)) {
    await message.reply(t('commands.system.ratelimit.notOwner'));
    return;
  }

  const action = args[0]?.toLowerCase();

  // No args — Show current global override settings
  if (!action) {
    const override = rateLimiter.getGlobalOverride();
    const anySet = override.userMaxCommands != null || override.guildMaxCommands != null;

    if (!anySet) {
      await message.reply(t('commands.system.ratelimit.notSet'));
      return;
    }

    await message.reply(
      t('commands.system.ratelimit.current', {
        userLimit: override.userMaxCommands?.toString() ?? '—',
        guildLimit: override.guildMaxCommands?.toString() ?? '—',
      })
    );
    return;
  }

  // user <n> — Set platform-wide user limit
  if (action === 'user') {
    const value = parseInt(args[1] ?? '', 10);
    if (isNaN(value) || value < 1) {
      await message.reply(t('commands.system.ratelimit.invalidValue'));
      return;
    }
    rateLimiter.setGlobalOverride(value, rateLimiter.getGlobalOverride().guildMaxCommands);
    rateLimiter.reset();
    await message.reply(t('commands.system.ratelimit.updatedUser', { limit: value }));
    return;
  }

  // guild <n> — Set platform-wide guild limit
  if (action === 'guild') {
    const value = parseInt(args[1] ?? '', 10);
    if (isNaN(value) || value < 1) {
      await message.reply(t('commands.system.ratelimit.invalidValue'));
      return;
    }
    rateLimiter.setGlobalOverride(rateLimiter.getGlobalOverride().userMaxCommands, value);
    rateLimiter.reset();
    await message.reply(t('commands.system.ratelimit.updatedGuild', { limit: value }));
    return;
  }

  // reset — Clear the global override back to defaults
  if (action === 'reset') {
    rateLimiter.clearGlobalOverride();
    rateLimiter.reset();
    await message.reply(t('commands.system.ratelimit.updatedReset'));
    return;
  }

  await message.reply(t('commands.system.ratelimit.unknownAction', { action }));
}
