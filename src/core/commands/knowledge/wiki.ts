import type { BotCommand } from '../../types.js';

export const WikiCommand: BotCommand = {
  name: 'wiki',
  description: 'Fetches a Wikipedia article summary based on a search term.',
  category: 'knowledge',
  async execute(message, args) {
    if (args.length === 0) {
      await message.reply('Please provide a search term.');
      return;
    }
    console.log(`Fetching Wikipedia summary for: ${args.join(' ')}`);

    try {
      const summary = await getWikipediaSummary(args.join(' '));
      await message.reply(`## 📖 ${summary.title}\n${summary.summary}\n\n🔗 <${summary.pageUrl}>`);
    } catch (error) {
      console.error(error);
      await message.reply('An error occurred while fetching the Wikipedia article.');
    }
  }
};

async function getWikipediaSummary(title: string) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Wikipedia request failed: ${res.status}`);
  }

  const data = await res.json();

  return {
    title: data.title,
    description: data.description,
    summary: data.extract,
    image: data.thumbnail?.source,
    pageUrl: data.content_urls?.desktop?.page,
  };
}
