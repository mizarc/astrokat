import QRCode from 'qrcode';
import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

const MAX_DATA_LENGTH = 2000;

export const QrcodeCommand: BotCommand = {
  name: 'qrcode',
  description: 'Generates a QR code from text or a URL.',
  category: 'utility',
  async execute(message, args) {
    const data = args.join(' ').trim();

    if (!data) {
      await message.reply(t('commands.qrcode.noInput'));
      return;
    }

    if (data.length > MAX_DATA_LENGTH) {
      await message.reply(
        t('commands.qrcode.tooLong', { length: data.length, max: MAX_DATA_LENGTH })
      );
      return;
    }

    let imageBuffer: Buffer;
    try {
      imageBuffer = await generateQrCode(data);
    } catch {
      await message.reply(t('commands.qrcode.failed'));
      return;
    }

    await message.reply({
      content: '',
      files: [imageBuffer],
      embeds: [
        {
          title: t('commands.qrcode.embedTitle'),
          color: 0x000000,
          image: { url: 'attachment://image.png' },
          footer: { text: t('commands.qrcode.embedFooter', { length: data.length }) },
        },
      ],
    });
  },
};

/**
 * Generates a QR code PNG buffer from the given data string.
 */
export async function generateQrCode(
  data: string,
): Promise<Buffer> {
  return QRCode.toBuffer(data, {
    type: 'png',
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
}