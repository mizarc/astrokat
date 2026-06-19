import { t } from '../../../../i18n.js';
import type { UnifiedMessage } from '../../../../types.js';

const VALID_STATUSES = ['online', 'idle', 'dnd', 'invisible'] as const;

function isOwner(message: { author: { id: string } }): boolean {
  const ownerIds = (process.env.BOT_OPERATOR_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ownerIds.includes(message.author.id);
}

export async function handlePresence(message: UnifiedMessage, args: string[]) {
  if (!isOwner(message)) {
    await message.reply(t('commands.system.presence.notOwner'));
    return;
  }

  if (args.length < 1) {
    await message.reply(t('commands.system.presence.usage'));
    return;
  }

  const raw = args[0]!;
  const status = raw.toLowerCase() as (typeof VALID_STATUSES)[number];

  if (!(VALID_STATUSES as readonly string[]).includes(status)) {
    await message.reply(t('commands.system.presence.invalid'));
    return;
  }

  if (!message.setPresence) {
    await message.reply(t('commands.system.presence.notAvailable'));
    return;
  }

  await message.setPresence(status);
  await message.reply(t('commands.system.presence.success', { status }));
}
