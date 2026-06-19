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

  // Reset subcommand — Sets the global override back to defaults
  if (action === 'reset') {
    rateLimiter.clearGlobalOverride();
    rateLimiter.reset();
    await message.reply(t('commands.system.ratelimit.updatedReset'));
    return;
  }

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

  // Set new global override values
  const userValue = parseInt(action, 10);
  const guildValue = args[1] ? parseInt(args[1], 10) : null;

  if (isNaN(userValue) || userValue < 1) {
    await message.reply(t('commands.system.ratelimit.invalidValue'));
    return;
  }

  if (guildValue != null && (isNaN(guildValue) || guildValue < 1)) {
    await message.reply(t('commands.system.ratelimit.invalidValue'));
    return;
  }

  rateLimiter.setGlobalOverride(userValue, guildValue);
  rateLimiter.reset();

  await message.reply(
    t('commands.system.ratelimit.updated', {
      userLimit: userValue.toString(),
      guildLimit: guildValue?.toString() ?? t('commands.system.ratelimit.unchanged'),
    })
  );
}
