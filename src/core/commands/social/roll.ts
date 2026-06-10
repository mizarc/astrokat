import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

export const RollCommand: BotCommand = {
  name: 'roll',
  description: 'Rolls dice with support for D&D notation (e.g. 2d20+6).',
  category: 'social',
  parameters: [
    {
      name: 'dice',
      description: 'Dice notation — e.g. "2d20+6", "d8", "20", or leave empty for d6',
      type: 'string',
      required: false,
    },
  ],
  async execute(message, args) {
    const input = args.join(' ');

    if (!input) {
      // Default: roll a d6
      const roll = rollDie(6);
      await message.reply(t('commands.roll.defaultResult', { result: roll.toString() }));
      return;
    }

    try {
      const result = parseDice(input);
      const formatted = formatResult(input, result);
      await message.reply(formatted);
    } catch {
      await message.reply(t('commands.roll.error'));
    }
  },
};

interface DiceResult {
  total: number;
  rolls: number[];
  modifier: number;
  notation: string;
  isPlain: boolean; // true when input was a plain number (e.g. "20" not "d20")
}

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function parseDice(input: string): DiceResult {
  const trimmed = input.trim();

  // Treat plain numbers as die sides (e.g., "20" → "1d20")
  if (/^\d+$/.test(trimmed)) {
    const sides = parseInt(trimmed, 10);
    const roll = rollDie(sides);
    return { total: roll, rolls: [roll], modifier: 0, notation: `1d${sides}`, isPlain: true };
  }

  // Dice notation: [count]d<sides>[+/-modifier]
  // e.g. 2d20+6, d8, 3d6-1, d%
  const match = trimmed.match(/^(\d+)?d(\d+|%)([+-]\d+)?$/i);
  if (!match) {
    throw new Error('Invalid dice format');
  }

  const count = parseInt(match[1] || '1', 10);
  const sidesRaw = match[2]!.toLowerCase();
  const sides = sidesRaw === '%' ? 100 : parseInt(sidesRaw, 10);

  if (count < 1 || sides < 1) {
    throw new Error('Invalid dice format');
  }

  const modifier = match[3] ? parseInt(match[3], 10) : 0;
  const notation = `${count}d${sidesRaw}${modifier >= 0 && match[3] ? '+' : ''}${modifier || ''}`;

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides));
  }

  const rawTotal = rolls.reduce((sum, r) => sum + r, 0);
  const total = rawTotal + modifier;

  return { total, rolls, modifier, notation, isPlain: false };
}

function formatResult(input: string, result: DiceResult): string {
  // Convert plain number input to casual format
  if (result.isPlain) {
    const sides = parseInt(input.trim(), 10);
    return t('commands.roll.plainResult', {
      sides: sides.toString(),
      result: result.total.toString(),
    });
  }

  // D&D notation input, show detailed result
  const rollList = result.rolls.join(', ');

  let modifierStr = '';
  if (result.modifier > 0) {
    modifierStr = t('commands.roll.modifier', {
      sign: '+',
      modifier: result.modifier.toString(),
    });
  } else if (result.modifier < 0) {
    modifierStr = t('commands.roll.modifier', {
      sign: '-',
      modifier: Math.abs(result.modifier).toString(),
    });
  }

  let resultStr = t('commands.roll.result', {
    notation: result.notation,
    rolls: rollList,
    modifier: modifierStr,
    total: result.total.toString(),
  });

  // Single die, check for crits
  if (result.rolls.length === 1) {
    const sidesMatch = input.trim().match(/^(\d+)?d(\d+|%)$/i);
    if (sidesMatch) {
      const sidesRaw = sidesMatch[2]!.toLowerCase();
      const sides = sidesRaw === '%' ? 100 : parseInt(sidesRaw, 10);
      if (result.rolls[0] === sides) {
        resultStr += t('commands.roll.critical');
      } else if (result.rolls[0] === 1) {
        resultStr += t('commands.roll.criticalFail');
      }
    }
  }

  return resultStr;
}