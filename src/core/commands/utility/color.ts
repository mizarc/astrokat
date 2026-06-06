import sharp from 'sharp';
import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

export interface ColorInfo {
  hex: string;
  rgb: string;
  hsl: string;
  cmyk: string;
}

export interface ColorResult {
  info: ColorInfo;
  imageBuffer: Buffer;
  formatted: string;
}

export const ColorCommand: BotCommand = {
  name: 'color',
  description: 'Shows a color preview with RGB, HSL, and CMYK values.',
  category: 'utility',
  async execute(message, args) {
    const hexCode = args[0];

    if (!hexCode) {
      await message.reply(t('commands.color.noColor'));
      return;
    }

    let result: ColorResult;
    try {
      result = generateColor(hexCode);
    } catch {
      await message.reply(t('commands.color.invalid'));
      return;
    }

    const { info } = result;
    const cleanHex = info.hex.replace('#', '');
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    const decimalColor = (r << 16) | (g << 8) | b;

    const imageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r, g, b },
      },
    })
      .png()
      .toBuffer();

    await message.reply({
      content: '',
      files: [imageBuffer],
      embeds: [
        {
          title: t('commands.color.embedTitle', { hex: info.hex }),
          color: decimalColor,
          thumbnail: { url: 'attachment://image.png' },
          fields: [
            { name: t('commands.color.fieldRgb'), value: info.rgb, inline: false },
            { name: t('commands.color.fieldHsl'), value: info.hsl, inline: false },
            { name: t('commands.color.fieldCmyk'), value: info.cmyk, inline: false },
          ],
        },
      ],
    });
  },
};

/**
 * Parses a hex code and returns color information
 * along with a 100x100 PNG preview buffer.
 */
export function generateColor(hexCode: string): ColorResult {
  const cleanHex = hexCode.replace('#', '');

  // Validate
  if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
    throw new Error(t('commands.color.parseError'));
  }

  // Parse RGB
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);

  // Normalize to 0-1
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  // HSL
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) / 6;
    } else {
      h = ((rn - gn) / d + 4) / 6;
    }
  }

  // CMYK
  const k = 1 - max;
  const c = k !== 1 ? (1 - rn - k) / (1 - k) : 0;
  const m = k !== 1 ? (1 - gn - k) / (1 - k) : 0;
  const y = k !== 1 ? (1 - bn - k) / (1 - k) : 0;

  const info: ColorInfo = {
    hex: `#${cleanHex.toUpperCase()}`,
    rgb: `${r}, ${g}, ${b}`,
    hsl: `${Math.round(h * 360)}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`,
    cmyk: [
      `${Math.round(c * 100)}%`,
      `${Math.round(m * 100)}%`,
      `${Math.round(y * 100)}%`,
      `${Math.round(k * 100)}%`,
    ].join(', '),
  };

  const formatted = t('commands.color.formatted', { hex: info.hex, rgb: info.rgb, hsl: info.hsl, cmyk: info.cmyk });

  return { info, imageBuffer: Buffer.alloc(0), formatted };
}