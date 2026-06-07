import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';

export const DefineCommand: BotCommand = {
  name: 'define',
  description: 'Fetches definitions and examples for a word using the Free Dictionary API.',
  category: 'knowledge',
  async execute(message, args) {
    if (args.length === 0) {
      await message.reply(t('commands.define.noWord'));
      return;
    }
    console.log(t('commands.define.fetching', { word: args.join(' ') }));

    try {
      const result = await getDictionary(args.join(' '));
      await message.reply(
        t('commands.define.result', { word: result.word, formatted: result.formatted })
      );
    } catch (error) {
      console.error(error);
      await message.reply(t('commands.define.error'));
    }
  }
};

interface DictionaryEntry {
  word: string;
  phonetic?: string;
  meanings: Array<{
    partOfSpeech: string;
    definitions: Array<{
      definition: string;
      example?: string;
    }>;
  }>;
}

export async function getDictionary(word: string) {
  const encoded = encodeURIComponent(word.toLowerCase());
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encoded}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Dictionary request failed: ${res.status}`);
  }

  const data: DictionaryEntry[] = await res.json();
  const entry = data[0];
  if (!entry) {
    throw new Error('No dictionary entries found for this word.');
  }

  const parts: string[] = [];

  // Phonetic info
  if (entry.phonetic) {
    parts.push(`*${entry.phonetic}*`);
  }

  // Group definitions by part of speech
  for (const meaning of entry.meanings) {
    const defs = meaning.definitions.slice(0, 3).map((def, i) => {
      let text = `${i + 1}. ${def.definition}`;
      if (def.example) {
        text += `\n   > ${def.example}`;
      }
      return text;
    });

    parts.push(`**${meaning.partOfSpeech}**`);
    parts.push(...defs);
  }

  return {
    word: entry.word,
    formatted: parts.join('\n\n').trim(),
  };
}
