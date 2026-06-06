import * as chrono from 'chrono-node';
import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';
import { reminderService } from '../../services/reminders/reminderService.js';

export const RemindmeCommand: BotCommand = {
  name: 'remindme',
  description: 'Sets a reminder for a specified time.',
  category: 'automation',
  async execute(message, args) {
    const input = args.join(' ').trim();

    if (!input) {
      await message.reply(t('commands.remindme.noInput'));
      return;
    }

    // Parse natural language time with chrono-node
    // If the bare input fails, prepend "in " (handles "15 seconds" → "in 15 seconds")
    let parsedTime = chrono.parseDate(input);
    let parseInput = input;

    if (!parsedTime) {
      const withIn = `in ${input}`;
      parsedTime = chrono.parseDate(withIn);
      if (parsedTime) {
        parseInput = withIn;
      }
    }

    if (!parsedTime) {
      await message.reply(t('commands.remindme.invalidTime'));
      return;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const targetTimestamp = Math.floor(parsedTime.getTime() / 1000);

    if (targetTimestamp <= currentTime) {
      await message.reply(t('commands.remindme.pastTime'));
      return;
    }

    // Extract the reminder message (everything after the time expression)
    const results = chrono.parse(parseInput);
    const firstResult = results[0];
    let reminderMessage = t('commands.remindme.defaultMessage');

    if (firstResult) {
      const afterTime = parseInput.slice(firstResult.index + firstResult.text.length).trim();
      if (afterTime.length > 0) {
        reminderMessage = afterTime;
      }
    }

    // Create the reminder — the service will emit 'reminderDue' when it's time
    const reminder = await reminderService.createReminder(
      message.userId,
      message.channelId,
      message.channelId,
      message.platform,
      reminderMessage,
      targetTimestamp,
      message.id,
    );

    await message.reply(t('commands.remindme.success', { time: reminder.dispatchTime }));
  },
};
