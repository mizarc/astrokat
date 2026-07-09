/**
 * Natural language cron expression parser.
 *
 * Accepts plain English phrases like "every day at 9am" or "daily"
 * and converts them to standard 5-field cron expressions.
 * If the input doesn't match any known pattern, it's returned as-is
 * (so raw cron expressions still work for power users).
 */

/** Parse a time string like "9am", "09:00", "9:30pm", "noon", "midnight".
 *  Returns { hour, minute } or null. */
function parseTime(str: string): { hour: number; minute: number } | null {
  const lower = str.toLowerCase().replace(/\s+/g, '');

  // noon / midnight
  if (lower === 'noon') return { hour: 12, minute: 0 };
  if (lower === 'midnight') return { hour: 0, minute: 0 };

  // "9am" / "9pm" / "930am" / "930pm"
  const amPmMatch = lower.match(/^(\d{1,2})(\d{2})?\s*(am|pm)$/);
  if (amPmMatch) {
    let hour = Number(amPmMatch[1]);
    const minute = amPmMatch[2] ? Number(amPmMatch[2]) : 0;
    const suffix = amPmMatch[3];
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (suffix === 'pm' && hour !== 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    return { hour, minute };
  }

  // "9:00" / "09:00" / "9:00am" / "09:00pm" / "9:00 am"
  const colonMatch = lower.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (colonMatch) {
    let hour = Number(colonMatch[1]);
    const minute = Number(colonMatch[2]);
    const suffix = colonMatch[3];
    if (hour > 23 || minute > 59) return null;
    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    return { hour, minute };
  }

  // 24h "9:00" / "21:00" (already covered by above but explicit)
  const h24Match = lower.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    const hour = Number(h24Match[1]);
    const minute = Number(h24Match[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
  }

  return null;
}

export function parseCronExpression(input: string): string {
  const lower = input.toLowerCase().trim();

  const presets: Record<string, string> = {
    hourly: '0 * * * *',
    daily: '0 0 * * *',
    weekly: '0 0 * * 0',
    weekdays: '0 0 * * 1-5',
    weekends: '0 0 * * 0,6',
    midnight: '0 0 * * *',
    noon: '0 12 * * *',
    everyminute: '* * * * *',
  };

  if (presets[lower] !== undefined) {
    return presets[lower];
  }

  const everyMin = lower.match(/^(?:every\s+)?(\d+)\s*(?:minutes?|min|m)\s*$/);
  if (everyMin) {
    const interval = Math.max(1, Number(everyMin[1]));
    return `*/${interval} * * * *`;
  }

  const everyHour = lower.match(/^(?:every\s+)?(\d+)\s*(?:hours?|hr|h)\s*$/);
  if (everyHour) {
    const interval = Math.max(1, Number(everyHour[1]));
    return `0 */${interval} * * *`;
  }

  const everySec = lower.match(/^(?:every\s+)?(\d+)\s*(?:seconds?|sec|s)\s*$/);
  if (everySec) {
    // Cron minimum is 1 minute — use every-minute as closest equivalent
    return '* * * * *';
  }

  const dailyAt = lower.match(/^(?:every\s+)?(?:day|daily)\s+(?:at\s+)?(.+)$/);
  if (dailyAt) {
    const t = parseTime((dailyAt[1] ?? '').trim());
    if (t) return `${t.minute} ${t.hour} * * *`;
  }

  const atTime = lower.match(/^at\s+(.+)$/);
  if (atTime) {
    const t = parseTime((atTime[1] ?? '').trim());
    if (t) return `${t.minute} ${t.hour} * * *`;
  }

  const timeOnly = parseTime(lower);
  if (timeOnly) {
    return `${timeOnly.minute} ${timeOnly.hour} * * *`;
  }

  const dayNames: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thur: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };

  // "every monday at 9am" / "mondays at 9am" / "every mon at 9am"
  const dayAt = lower.match(
    /^(?:every\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat|tues|thur|thurs)\s*(?:s\b)?(?:\s+at\s+(.+))?$/
  );
  if (dayAt) {
    const dayNum = dayNames[dayAt[1]!];
    if (dayNum !== undefined) {
      if (dayAt[2]) {
        const t = parseTime(dayAt[2].trim());
        if (t) return `${t.minute} ${t.hour} * * ${dayNum}`;
      }
      return `0 0 * * ${dayNum}`;
    }
  }

  // "every monday and wednesday at 9am"
  const multiDayAt = lower.match(/^(?:every\s+)?(.+?)(?:\s+at\s+(.+))?$/);
  if (multiDayAt) {
    const dayPart = multiDayAt[1]!.toLowerCase();
    const days = dayPart
      .split(/\s+(?:and|,|&)\s*|\s*,\s*/)
      .flatMap((d) => d.split(/\s+/))
      .map((d) => d.replace(/s$/, '').trim())
      .filter((d) => dayNames[d] !== undefined);

    if (days.length >= 2) {
      const dayNums = days.map((d) => dayNames[d]).sort();
      if (multiDayAt[2]) {
        const t = parseTime(multiDayAt[2].trim());
        if (t) return `${t.minute} ${t.hour} * * ${dayNums.join(',')}`;
      }
      return `0 0 * * ${dayNums.join(',')}`;
    }
  }

  // "weekdays at <time>" / "weekends at <time>"
  const periodAt = lower.match(/^(weekdays|weekends|weekday|weekend)(?:\s+at\s+(.+))?$/);
  if (periodAt) {
    const period = periodAt[1]!.toLowerCase();
    const dayRange = period === 'weekdays' || period === 'weekday' ? '1-5' : '0,6';
    if (periodAt[2]) {
      const t = parseTime(periodAt[2].trim());
      if (t) return `${t.minute} ${t.hour} * * ${dayRange}`;
    }
    return `0 0 * * ${dayRange}`;
  }

  // If not recognised, return raw (cron.validate will catch bad input)

  return input;
}

// Reverse parser
const DAY_NAMES: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

/**
 * Convert a cron expression back into a consistent human-readable string.
 *
 * Handles all patterns that parseCronExpression produces:
 *   - presets (hourly, daily, weekly, etc.)
 *   - intervalled (every N minutes/hours)
 *   - time-of-day patterns
 *   - day-of-week patterns
 *   - weekday/weekend ranges
 *
 * If the cron doesn't match any known pattern, returns the raw cron string
 * so power users still see something (vs. showing nothing useful).
 */
export function cronToHuman(cronExpr: string): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return cronExpr;

  const min = parts[0]!;
  const hour = parts[1]!;
  const dom = parts[2]!;
  const month = parts[3]!;
  const dow = parts[4]!;

  // Every N minutes within an hour
  if (min === '*') {
    if (hour === '*') return 'every minute';
    const hInt = parseInt(hour, 10);
    if (!isNaN(hInt) && hour.startsWith('*/')) {
      if (hInt === 1) return 'every minute';
      return `every ${hInt} minutes`;
    }
  }

  if (hour === '*') return cronExpr; // unusual

  // Every N hours
  if (min === '0' && hour.startsWith('*/')) {
    const hInt = parseInt(hour.slice(2), 10);
    if (hInt === 1) return 'every hour';
    return `every ${hInt} hours`;
  }

  // Extract the time part
  const timeStr = formatCronTime(min, hour);

  // Every N minutes
  if (min.startsWith('*/')) {
    const mInt = parseInt(min.slice(2), 10);
    if (mInt === 1) return 'every minute';
    return `every ${mInt} minutes`;
  }

  // Day-of-week patterns
  if (dom === '*' && month === '*' && dow !== '*') {
    if (dow === '1-5') return `weekdays at ${timeStr}`;
    if (dow === '0,6') return `weekends at ${timeStr}`;
    if (dow === '6,0') return `weekends at ${timeStr}`;

    // Single day
    const singleDay = parseInt(dow, 10);
    if (!isNaN(singleDay) && DAY_NAMES[singleDay]) {
      if (timeStr === 'midnight') return `weekly on ${DAY_NAMES[singleDay]}`;
      if (timeStr === 'noon') return `weekly on ${DAY_NAMES[singleDay]} at noon`;
      return `every ${DAY_NAMES[singleDay]} at ${timeStr}`;
    }

    // Multiple days e.g. "1,3,5"
    const dayNums = dow
      .split(',')
      .map(Number)
      .filter((n) => !isNaN(n));
    if (dayNums.length >= 2) {
      const dayNames = dayNums.map((n) => DAY_NAMES[n]).filter(Boolean);
      if (dayNames.length >= 2) {
        const last = dayNames.pop()!;
        const days = dayNames.join(', ') + ` and ${last}`;
        return `every ${days} at ${timeStr}`;
      }
    }
  }

  // Daily patterns

  if (dom === '*' && month === '*' && dow === '*') {
    if (timeStr === 'midnight') return 'daily at midnight';
    if (timeStr === 'noon') return 'daily at noon';
    return `daily at ${timeStr}`;
  }

  return cronExpr;
}

/**
 * Format minute + hour fields into a time string.
 * Returns "midnight" for 00:00, "noon" for 12:00, otherwise "HH:MM am/pm".
 */
function formatCronTime(min: string, hour: string): string {
  const h = parseInt(hour, 10);
  const m = parseInt(min, 10);
  if (isNaN(h) || isNaN(m)) return `${hour}:${min}`;

  if (h === 0 && m === 0) return 'midnight';
  if (h === 12 && m === 0) return 'noon';

  const period = h >= 12 ? 'pm' : 'am';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0
    ? `${displayHour}${period}`
    : `${displayHour}:${m.toString().padStart(2, '0')}${period}`;
}
