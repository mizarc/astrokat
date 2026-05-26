import type { BotCommand } from '../../types.js';

export const ThesaurusCommand: BotCommand = {
  name: 'thesaurus',
  description: 'Fetches synonyms and antonyms for a word using the Free Dictionary API.',
  category: 'knowledge',
  async execute(message, args) {
    if (args.length === 0) {
      await message.reply('Please provide a word to look up.');
      return;
    }
    console.log(`Fetching thesaurus for: ${args.join(' ')}`);

    try {
      const result = await getThesaurus(args.join(' '));
      await message.reply(`## 📚 ${result.word}\n\n${result.formatted}`);
    } catch (error) {
      console.error(error);
      await message.reply('An error occurred while fetching the word definition.');
    }
  }
};

export async function getThesaurus(word: string) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Dictionary request failed: ${res.status}`);
  }

  const data = await res.json();
  const entry = data[0];

  const allSynonyms = new Set<string>();
  const allAntonyms = new Set<string>();

  // Collect all synonyms and antonyms across all meanings
  if (entry.meanings && entry.meanings.length > 0) {
    entry.meanings.forEach((meaning: any) => {
      if (meaning.synonyms && meaning.synonyms.length > 0) {
        meaning.synonyms.forEach((syn: string) => allSynonyms.add(syn));
      }
      if (meaning.antonyms && meaning.antonyms.length > 0) {
        meaning.antonyms.forEach((ant: string) => allAntonyms.add(ant));
      }
    });
  }

  let formatted = '';

  if (allSynonyms.size > 0) {
    formatted += `✓ Synonyms: ${Array.from(allSynonyms).slice(0, 10).join(', ')}\n`;
  }

  if (allAntonyms.size > 0) {
    formatted += `✗ Antonyms: ${Array.from(allAntonyms).slice(0, 10).join(', ')}\n`;
  }

  if (!formatted) {
    formatted = 'No synonyms or antonyms found.';
  }

  return {
    word: entry.word,
    formatted: formatted.trim(),
  };
}
