import { t } from '../../../../i18n.js';
import { get as unicodeEmoji } from 'node-emoji';
import type { UnifiedMessage } from '../../../../types.js';

/**
 * Matches a leading custom emoji (<:name:id>), animated (<a:name:id>),
 * shortcode (:name:), or raw Unicode emoji.
 */
const LEADING_EMOJI_RE = new RegExp(
  '^(<a?:(\\w+):(\\d+)>|:(\\w+):|' +
    '(\\p{Emoji_Presentation}|\\p{Extended_Pictographic})' +
    '(\\u200d\\p{Extended_Pictographic})*)',
  'u'
);

function isOwner(message: { author: { id: string } }): boolean {
  const ownerIds = (process.env.BOT_OPERATOR_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ownerIds.includes(message.author.id);
}

export async function handleStatus(message: UnifiedMessage, args: string[]) {
  if (!isOwner(message)) {
    await message.reply(t('commands.system.status.notOwner'));
    return;
  }

  if (args.length < 1) {
    await message.reply(t('commands.system.status.usage'));
    return;
  }

  const raw = args.join(' ');
  let emojiName: string | null = null;
  let text: string;

  const match = raw.match(LEADING_EMOJI_RE);
  let emojiId: string | null = null;
  if (match) {
    if (match[2] && match[3]) {
      // Custom emoji: <:name:id> or <a:name:id>
      emojiName = match[2];
      emojiId = match[3];
    } else if (match[4]) {
      // Shortcode (:name:) — resolve to Unicode character when possible
      emojiName = unicodeEmoji(match[4]) ?? match[4];
    } else {
      // Raw Unicode emoji
      emojiName = match[0];
    }
    text = raw.slice(match[0].length).trim();
  } else {
    text = raw;
  }

  if (!message.setStatus) {
    await message.reply(t('commands.system.status.notAvailable'));
    return;
  }

  await message.setStatus({ text, emojiName, emojiId });
  const display = emojiName ? `${emojiName} ${text}` : text;
  await message.reply(t('commands.system.status.success', { text: display }));
}
