import { t } from '../../../../i18n.js';
import { guildConfigService } from '../../../../services/guildconfig/guildConfigService.js';

const localeKey = 'commands.settings.prefix';

export async function handlePrefix(message: any, guildId: string, args: string[]): Promise<void> {
  const botMention = message.botUserId ? `<@${message.botUserId}>` : '@Bot';
  const action = args[0]?.toLowerCase();

  // No args — show current prefix
  if (!action) {
    return showCurrentPrefix(message, guildId, botMention);
  }

  // Mutating actions require Manage Guild permission
  if (message.channel?.userCanManageGuild) {
    const allowed = await message.channel.userCanManageGuild();
    if (!allowed) {
      await message.reply(t(`${localeKey}.noPermission`));
      return;
    }
  }

  switch (action) {
    case 'set':
      return setPrefix(message, guildId, args.slice(1).join(' '), botMention);
    case 'reset':
      return resetPrefix(message, guildId, botMention);
    default:
      await message.reply(t(`${localeKey}.unknownAction`, { action }));
  }
}

async function showCurrentPrefix(message: any, guildId: string, botMention: string): Promise<void> {
  const config = await guildConfigService.get(guildId);
  const prefix = config.prefix ?? '!';

  if (config.prefix) {
    await message.reply(t(`${localeKey}.currentCustom`, { prefix, botMention }));
  } else {
    await message.reply(t(`${localeKey}.currentDefault`, { prefix, botMention }));
  }
}

async function setPrefix(
  message: any,
  guildId: string,
  value: string,
  botMention: string
): Promise<void> {
  const raw = value.trim();

  if (!raw) {
    await message.reply(t(`${localeKey}.setUsage`));
    return;
  }

  if (raw.length > 5) {
    await message.reply(t(`${localeKey}.tooLong`));
    return;
  }

  // Reject whitespace-only or multi-word prefixes
  if (/\s/.test(raw)) {
    await message.reply(t(`${localeKey}.noSpaces`));
    return;
  }

  await guildConfigService.set(guildId, { prefix: raw });
  await message.reply(t(`${localeKey}.setSuccess`, { prefix: raw, botMention }));
}

async function resetPrefix(message: any, guildId: string, botMention: string): Promise<void> {
  await guildConfigService.set(guildId, { prefix: null });
  await message.reply(t(`${localeKey}.resetSuccess`, { botMention }));
}
