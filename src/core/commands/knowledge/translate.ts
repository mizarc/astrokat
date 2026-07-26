import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

export const TranslateCommand: BotCommand = {
  name: 'translate',
  description:
    'Translate text. Format: !translate <target>, or ' +
    '!translate <source>:<target> (defaults en→target).',
  category: 'knowledge',
  parameters: [
    { name: 'text', description: 'The text to translate', type: 'string', required: true },
    {
      name: 'target',
      description: 'The target language code (e.g. es, fr, ja)',
      type: 'string',
      required: true,
    },
    {
      name: 'source',
      description: 'The source language code (default: en)',
      type: 'string',
      required: false,
    },
  ],
  async execute(message, args) {
    if (args.length < 2) {
      await message.reply(t('commands.translate.noInput'));
      return;
    }

    const langArg = args[0]!.toLowerCase();
    const text = args.slice(1).join(' ');

    // Support optional "source:target" syntax, otherwise default source to 'en'
    const colonIndex = langArg.indexOf(':');
    const sourceLang = colonIndex !== -1 ? langArg.slice(0, colonIndex) : 'en';
    const targetLang = colonIndex !== -1 ? langArg.slice(colonIndex + 1) : langArg;

    try {
      const translation = await translate(text, targetLang, sourceLang);
      await message.reply(t('commands.translate.result', { sourceLang, targetLang, translation }));
    } catch (error) {
      const msg = (error instanceof Error ? error.message : '').toLowerCase();
      if (msg.includes('language') || msg.includes('not supported') || msg.includes('invalid')) {
        await message.reply(t('commands.translate.invalidLang', { lang: langArg }));
      } else {
        console.error(error);
        await message.reply(t('commands.translate.error'));
      }
    }
  },
};

/**
 * Translate text to a target language using the MyMemory API (free, no key needed).
 *
 * @param text - The text to translate.
 * @param targetLang - The target language code (e.g., 'es', 'fr', 'ja').
 * @param sourceLang - The source language code (defaults to 'en').
 * @returns The translated text.
 */
async function translate(text: string, targetLang: string, sourceLang = 'en'): Promise<string> {
  const params = new URLSearchParams({
    q: text,
    langpair: `${sourceLang}|${targetLang}`,
  });

  const res = await fetch(`https://api.mymemory.translated.net/get?${params}`);

  if (!res.ok) {
    throw new Error(`Translation request failed: ${res.status}`);
  }

  const data = await res.json();

  if (data.responseStatus !== 200) {
    // MyMemory returns 403 with responseDetails like "Source language 'hello' is not supported"
    throw new Error(data.responseDetails ?? `Translation failed: ${data.responseStatus}`);
  }

  return data.responseData.translatedText;
}
