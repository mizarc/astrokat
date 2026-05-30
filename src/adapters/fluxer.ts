import { Client } from '@fluxerjs/core';
import type { UnifiedMessage } from '../core/types.js';
import { handleIncomingMessage } from '../core/router.js';
import { Events } from 'discord.js';

export function startFluxerBot() {
  const client = new Client({ intents: 0 });
  const messageCache = new Map<string, any>();

  client.on(Events.MessageCreate, async (message) => {
    // 1. Ignore bot messages to prevent infinite loops
    if (message.author?.bot) return;
    console.log(`[FLUXER] Received message: ${message.content} from ${message.author?.username}`);

    const conversationId = `${message.channelId}-${message.author.id}`;

    // 2. Map to UnifiedMessage
    const unified: UnifiedMessage = {
      id: message.id,
      content: message.content,
      userId: message.author.id,
      username: message.author.username,
      channelId: message.channelId,
      platform: 'fluxer',
      reply: async (text) => {
        const reply = await message.reply(text);
        messageCache.set(conversationId, reply);
        return reply;
      }
      ,
      edit: async (text) => {
        const last = messageCache.get(conversationId);
        if (last && typeof last.edit === 'function') {
          const updated = await last.edit({ content: text });
          messageCache.set(conversationId, updated);
          return updated;
        } else {
          const reply = await message.reply(text);
          messageCache.set(conversationId, reply);
          return reply;
        }
      }
    };

    // 3. Send to Router
    await handleIncomingMessage(unified, false);
  });

  const fluxerToken = process.env.FLUXER_TOKEN;
  if (!fluxerToken) {
    console.error("FLUXER_TOKEN is not defined in .env");
    process.exit(1); // Stop the bot
  }
  client.login(fluxerToken);
}