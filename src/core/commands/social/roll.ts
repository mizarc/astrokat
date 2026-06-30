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

  // Strip all whitespace so "2d4 + 3d6 + 7" becomes "2d4+3d6+7"
  const cleaned = trimmed.replace(/\s+/g, '');

  // Tokenize into dice groups and flat modifiers
  // Each token is either [sign][count]d<sides> or [sign]<number>
  const tokens = cleaned.match(/[+-]?(?:\d*[dD](?:\d+|%)|\d+)/g);
  if (!tokens || tokens.length === 0) {
    throw new Error('Invalid dice format');
  }

  const allRolls: number[] = [];
  let modifier = 0;
  const notationParts: string[] = [];

  for (const token of tokens) {
    const diceMatch = token.match(/^([+-])?(\d+)?[dD](\d+|%)$/);
    if (diceMatch) {
      const sign = diceMatch[1] === '-' ? -1 : 1;
      const count = parseInt(diceMatch[2] || '1', 10);
      const sidesRaw = diceMatch[3]!;
      const sides = sidesRaw === '%' ? 100 : parseInt(sidesRaw, 10);

      if (count < 1 || sides < 1) throw new Error('Invalid dice format');

      const signStr = sign === -1 ? '-' : notationParts.length > 0 ? '+' : '';
      notationParts.push(`${signStr}${count}d${sidesRaw}`);

      for (let i = 0; i < count; i++) {
        allRolls.push(rollDie(sides) * sign);
      }
    } else {
      // Flat modifier
      const val = parseInt(token, 10);
      if (isNaN(val)) throw new Error('Invalid dice format');
      modifier += val;
      if (notationParts.length > 0) {
        notationParts.push(val >= 0 ? `+${val}` : `${val}`);
      } else {
        notationParts.push(`${val}`);
      }
    }
  }

  const notation = notationParts.join('');
  const rawTotal = allRolls.reduce((sum, r) => sum + r, 0);
  const total = rawTotal + modifier;

  return { total, rolls: allRolls, modifier, notation, isPlain: false };
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
