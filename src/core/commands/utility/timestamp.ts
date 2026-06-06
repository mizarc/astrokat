import { casual } from 'chrono-node';
import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

/**
 * Timestamp format labels and their style suffixes.
 */
const FORMATS: { name: string; style: string }[] = [
  { name: 'commands.timestamp.formatShortTime', style: 't' },
  { name: 'commands.timestamp.formatLongTime', style: 'T' },
  { name: 'commands.timestamp.formatShortDate', style: 'd' },
  { name: 'commands.timestamp.formatLongDate', style: 'D' },
  { name: 'commands.timestamp.formatShortDateTime', style: 'f' },
  { name: 'commands.timestamp.formatLongDateTime', style: 'F' },
  { name: 'commands.timestamp.formatRelativeTime', style: 'R' },
];

export const TimestampCommand: BotCommand = {
  name: 'timestamp',
  description: 'Converts a date/time string into timestamp formats.',
  category: 'utility',
  async execute(message, args) {
    const time = args.join(' ').trim();

    if (!time) {
      await message.reply(t('commands.timestamp.noInput'));
      return;
    }

    const result = timestamp(time);
    await message.reply(result);
  },
};

/**
 * Parses a natural-language date/time string and returns a formatted
 * string with all timestamp representations.
 */
export function timestamp(time: string): string {
  const parsed = casual.parseDate(time);

  if (!parsed) {
    return t('commands.timestamp.invalid');
  }

  const unixTime = Math.floor(parsed.getTime() / 1000);

  return FORMATS.map(({ name, style }) => {
    const code = `<t:${unixTime}:${style}>`;
    return t('commands.timestamp.resultLine', { name: t(name), code });
  }).join('\n');
}