import { evaluate } from 'mathjs';
import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

export interface CalcResult {
  expression: string;
  result: number | string;
  formatted: string;
}

export function calculate(expression: string): CalcResult {
  const result = evaluate(expression);
  const formatted = typeof result === 'number' && !Number.isInteger(result)
    ? Math.round(result * 1e6) / 1e6
    : result;
  return { expression, result, formatted: `${expression} = ${formatted}` };
}

export const CalcCommand: BotCommand = {
  name: 'calc',
  description: 'Evaluates a basic math expression.',
  category: 'utility',
  async execute(message, args) {
    const expression = args.join(' ');

    if (!expression) {
      await message.reply(t('commands.calc.noExpression'));
      return;
    }

    try {
      const { expression: expr, result } = calculate(expression);
      await message.reply(t('commands.calc.result', { expression: expr, result: String(result) }));
    } catch {
      await message.reply(t('commands.calc.invalidExpression'));
    }
  }
};
