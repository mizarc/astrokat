import { t } from '../core/i18n.js';
import { Client, EmbedBuilder, Events, PermissionFlags, GatewayOpcodes } from '@fluxerjs/core';
import type { UnifiedMessage, UnifiedAuthor, UnifiedChannel, ReplyEmbed } from '../core/types.js';
import { handleIncomingMessage, awardMessageXp } from '../core/router.js';
import { reminderService } from '../core/services/reminders/reminderService.js';

/** Tracks the bot's presence status so setStatus and setPresence compose cleanly. */
let currentPresenceStatus: 'online' | 'idle' | 'dnd' | 'invisible' = 'online';

/**
 * Updates the stored presence status (online/idle/dnd/invisible).
 * Call before sending a presence update so setStatus doesn't override it.
 */
export function setPresenceStatus(status: 'online' | 'idle' | 'dnd' | 'invisible'): void {
  currentPresenceStatus = status;
}

function toFluxerEmbeds(embeds: ReplyEmbed[]): EmbedBuilder[] {
  return embeds.map((e) => {
    const embed = new EmbedBuilder();
    if (e.title) embed.setTitle(e.title);
    if (e.description) embed.setDescription(e.description);
    if (e.color !== undefined) embed.setColor(e.color);
    if (e.fields) {
      embed.addFields(
        ...e.fields.map((f) => ({
          name: f.name,
          value: f.value,
          inline: f.inline ?? false,  
        })),
      );
    }
    if (e.thumbnail) embed.setThumbnail(e.thumbnail.url);
    if (e.image) embed.setImage(e.image.url);
    if (e.footer) embed.setFooter({ text: e.footer.text });
    return embed;
  });
}

export function startFluxerBot() {
  const client = new Client({ intents: 0 });
  const messageCache = new Map<string, any>();

  client.on(Events.MessageCreate, async (message) => {
    // 1. Ignore bot messages to prevent infinite loops
    if (message.author?.bot) return;
    console.log(t('fluxer.receivedMessage', { content: message.content, username: message.author?.username ?? 'unknown' }));

    const conversationId = `${message.channelId}-${message.author.id}`;

    // Build channel abstraction
    const channel: UnifiedChannel = {
      id: message.channelId,
      canManageMessages: async () => {
        try {
          const ch = await client.channels.resolve(message.channelId);
          if (!ch || !('bulkDeleteMessages' in ch)) return false;
          const guild = await message.resolveGuild();
          if (!guild) return false;
          const botMember = await guild.members.fetchMe();
          return botMember.permissions.has(PermissionFlags.ManageMessages);
        } catch {
          return false;
        }
      },
      userCanManageMessages: async () => {
        try {
          const ch = await client.channels.resolve(message.channelId);
          if (!ch || !('bulkDeleteMessages' in ch)) return false;
          const guild = await message.resolveGuild();
          if (!guild) return false;
          const authorMember = await guild.members.resolve(message.author.id);
          return authorMember.permissions.has(PermissionFlags.ManageMessages);
        } catch {
          return false;
        }
      },
      fetchMessages: async (limit: number) => {
        try {
          const raw: any[] = await client.rest.get(
            `/channels/${message.channelId}/messages?limit=${limit}`,
          );
          return (raw ?? []).map((m: any) => ({
            id: m.id,
            authorId: m.author.id,
            createdAt: new Date(m.timestamp),
          }));
        } catch {
          return [];
        }
      },
      bulkDelete: async (messageIds: string[]) => {
        if (messageIds.length === 0) return;
        await client.rest.post(
          `/channels/${message.channelId}/messages/bulk-delete`,
          { body: { messages: messageIds } },
        );
      },
    };

    const author: UnifiedAuthor = {
      id: message.author.id,
      username: message.author.username,
      avatarUrl: message.author.displayAvatarURL({ size: 1024 }),
    };

    // 2. Map to UnifiedMessage
    const unified: UnifiedMessage = {
      id: message.id,
      content: message.content,
      author,
      channel,
      client: client,
      ...((message as any).guildId ? { guildId: (message as any).guildId } : {}),
      platform: 'fluxer',
      fetchUser: async (userId) => {
        try {
          const user = await client.users.fetch(userId);
          return {
            username: user.username,
            avatarUrl: user.displayAvatarURL({ size: 1024 }),
          };
        } catch {
          return null;
        }
      },
      reply: async (response) => {
        if (typeof response === 'string') {
          const reply = await message.reply(response);
          messageCache.set(conversationId, reply);
          return reply;
        }
        const opts: Record<string, unknown> = {};
        if (response.content) opts.content = response.content;
        if (response.embeds?.length) {
          opts.embeds = toFluxerEmbeds(response.embeds);
        }
        if (response.files?.length) {
          opts.files = response.files.map((f) => {
            if ('name' in f) {
              return { data: f.data, name: f.name };
            }
            return { data: f, name: 'image.png' };
          });
        }
        const reply = await message.reply(opts);
        messageCache.set(conversationId, reply);
        return reply;
      },
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
      },
      setStatus: async ({ text, emojiName, emojiId }) => {
        const customStatus: Record<string, string | null> = {
          text,
          emoji_name: emojiName ?? null,
        };
        // Only include emoji_id for custom server emojis — don't send null for Unicode emojis
        if (emojiId) customStatus.emoji_id = emojiId;
        const payload = {
          op: GatewayOpcodes.PresenceUpdate as number,
          d: {
            status: currentPresenceStatus,
            since: null,
            afk: false,
            custom_status: customStatus,
          },
        };
        client.sendToGateway(0, payload);
      },
      setPresence: async (status) => {
        currentPresenceStatus = status;
        client.sendToGateway(0, {
          op: GatewayOpcodes.PresenceUpdate as number,
          d: {
            status,
            since: null,
            afk: false,
          },
        });
      },
    };

    // 3. Send to Router
    await handleIncomingMessage(unified, false);

    // Award XP for every message in a guild
    await awardMessageXp(unified);
  });

  // Register reminder listener
  client.on('ready', () => {
    reminderService.on('reminderDue', async ({ reminder }) => {
      if (reminder.platform !== 'fluxer') return;
      try {
        const channel = await client.channels.fetch(reminder.channelId);
        if (!channel || !('send' in channel) || typeof channel.send !== 'function') return;

        type TC = {
          send: (content: string) => Promise<unknown>;
          messages?: {
            fetch: (id: string) => Promise<{ reply: (content: string) => Promise<unknown> }>;
          };
        };
        const textChannel = channel as TC;

        const content = t('reminder.dueGeneric', { message: reminder.message });
        const contentWithMention = t('reminder.dueMention', { userId: reminder.userId, message: reminder.message });

        // Try to reply to the original message if we have the ID
        if (reminder.referenceMessageId && textChannel.messages?.fetch) {
          try {
            const originalMsg = await textChannel.messages.fetch(reminder.referenceMessageId);
            await originalMsg.reply(content);
            return;
          } catch {
            // Original message deleted — fall through to .send() with a ping
          }
        }

        await textChannel.send(contentWithMention);
      } catch (error) {
        console.error(t('reminder.failedDispatchFluxer'), error);
      }
    });
    console.log(t('reminder.listeningFluxer'));
  });

  // Gracefully handle connection drops (sleep/wake, network blips)
  client.on('error', (err: Error) => {
    console.warn(t('fluxer.connectionError'), err.message);
  });

  const fluxerToken = process.env.FLUXER_TOKEN;
  if (!fluxerToken) {
    console.error(t('fluxer.tokenMissing'));
    process.exit(1); // Stop the bot
  }
  client.login(fluxerToken);
}