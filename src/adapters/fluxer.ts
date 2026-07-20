import { t } from '../core/i18n.js';
import { Client, EmbedBuilder, Events, PermissionFlags, GatewayOpcodes } from '@fluxerjs/core';
import { SnowflakeUtil } from '@fluxerjs/util';
import type { UnifiedMessage, UnifiedAuthor, UnifiedChannel, ReplyEmbed } from '../core/types.js';
import { handleIncomingMessage, awardMessageXp } from '../core/router.js';
import { reminderService } from '../core/services/reminders/reminderService.js';
import { reactionRoleService } from '../core/services/reactionrole/reactionRoleService.js';
import { joinRoleService } from '../core/services/joinrole/joinRoleService.js';
import { levelRoleService } from '../core/services/levelrole/levelRoleService.js';
import type { GuildAggregator, GuildStats, ActionDispatcher } from '../core/types.js';

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
        }))
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
    console.log(
      t('fluxer.receivedMessage', {
        content: message.content,
        username: message.author?.username ?? 'unknown',
      })
    );

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
      userCanManageGuild: async () => {
        try {
          const ch = await client.channels.resolve(message.channelId);
          if (!ch || !('bulkDeleteMessages' in ch)) return false;
          const guild = await message.resolveGuild();
          if (!guild) return false;
          const authorMember = await guild.members.resolve(message.author.id);
          return authorMember.permissions.has(PermissionFlags.ManageGuild);
        } catch {
          return false;
        }
      },
      fetchMessage: async (messageId: string) => {
        // Try current channel first
        try {
          const raw: any = await client.rest.get(
            `/channels/${message.channelId}/messages/${messageId}`
          );
          if (raw) return { id: raw.id, content: raw.content ?? '', channelId: message.channelId };
        } catch {
          // Not in current channel
        }
        // Try searching other guild channels via REST
        try {
          const guild = await (message as any).resolveGuild?.();
          if (guild && guild.channels) {
            for (const [, channel] of guild.channels) {
              if (channel.id === message.channelId) continue;
              if ((channel as any).isTextBased?.()) {
                try {
                  const raw: any = await client.rest.get(
                    `/channels/${channel.id}/messages/${messageId}`
                  );
                  if (raw) return { id: raw.id, content: raw.content ?? '', channelId: channel.id };
                } catch {
                  continue;
                }
              }
            }
          }
        } catch {
          // Can't search guild channels
        }
        return null;
      },
      resolveEmoji: async (emoji: string) => {
        // Strip Discord <:name:id> format to name:id (already validated by Discord)
        const discordMatch = emoji.match(/^<a?:(\w+):(\d+)>$/);
        if (discordMatch) return `${discordMatch[1]!}:${discordMatch[2]!}`;
        // Strip colons from :name: format and resolve via Fluxer
        const stripped = emoji.replace(/^:+|:+$/g, '');
        const guildId = (message as any).guildId;
        return await client.resolveEmoji(stripped, guildId ?? undefined);
      },
      reactToMessage: async (channelId: string, messageId: string, emoji: string) => {
        try {
          const guildId = (message as any).guildId;
          // Strip Discord <:name:id> format to name:id
          const discordMatch = emoji.match(/^<a?:(\w+):(\d+)>$/);
          const resolved = discordMatch
            ? `${discordMatch[1]!}:${discordMatch[2]!}`
            : await client.resolveEmoji(emoji, guildId ?? undefined);
          const route = `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(resolved)}/@me`;
          await client.rest.put(route);
        } catch (err: any) {
          if (err?.statusCode === 400 || err?.statusCode === 403) {
            // Custom emoji not available on this platform — skip gracefully
          } else {
            console.error(
              `[REACTION_ROLE] Auto-react failed:`,
              err instanceof Error ? err.message : err
            );
          }
        }
      },
      removeReactionFromMessage: async (channelId: string, messageId: string, emoji: string) => {
        try {
          const guildId = (message as any).guildId;
          const cleaned = emoji.replace(/^:+|:+$/g, '');
          const resolved = cleaned.includes(':')
            ? cleaned
            : await client.resolveEmoji(cleaned, guildId ?? undefined);
          const route = `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(resolved)}/@me`;
          console.log(`[REACTION_ROLE] Removing reaction: msg=${messageId} emoji="${resolved}"`);
          await client.rest.delete(route);
        } catch (err) {
          console.error(
            `[REACTION_ROLE] Remove reaction failed:`,
            err instanceof Error ? err.message : err
          );
        }
      },
      fetchMessages: async (limit: number) => {
        try {
          const raw: any[] = await client.rest.get(
            `/channels/${message.channelId}/messages?limit=${limit}`
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
        await client.rest.post(`/channels/${message.channelId}/messages/bulk-delete`, {
          body: { messages: messageIds },
        });
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
      botUserId: (client as any).user?.id,
      ...((message as any).member?.roles?.roleIds
        ? { memberRoles: [...(message as any).member.roles.roleIds] as string[] }
        : {}),
      deferReply: async () => {
        // Fluxer doesn't require interaction deferral — no-op
      },
      fetchUser: async (userId) => {
        try {
          const user = await client.users.fetch(userId);
          return {
            username: user.username,
            avatarUrl: user.displayAvatarURL({ size: 1024 }),
            bot: user.bot,
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
      followUp: async (text) => {
        const reply = await message.reply(text);
        return reply;
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

  // Register level role assigner
  levelRoleService.setRoleAssigner(async (guildId, userId, roleId) => {
    try {
      const guild = await client.guilds.resolve(guildId);
      if (!guild) return false;
      const member = await guild.fetchMember(userId);
      await member.roles.add(roleId);
      return true;
    } catch {
      return false;
    }
  });

  // Register join role assigner
  joinRoleService.setRoleAssigner(async (guildId, userId, roleId) => {
    try {
      const guild = await client.guilds.resolve(guildId);
      if (!guild) return false;
      const member = await guild.fetchMember(userId);
      await member.roles.add(roleId);
      return true;
    } catch {
      return false;
    }
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
        const contentWithMention = t('reminder.dueMention', {
          userId: reminder.userId,
          message: reminder.message,
        });

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

  // Reaction Role Event Handlers

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    if (!reaction.guildId) return;

    const guildId = reaction.guildId;
    const messageId = reaction.messageId;
    const emoji = reaction.emojiIdentifier;

    try {
      const guild = await client.guilds.resolve(guildId);
      if (!guild) return;

      const member = await guild.fetchMember(user.id);

      await reactionRoleService.handleReactionAdd(guildId, messageId, emoji, {
        roles: {
          add: async (roleId: string) => {
            await member.roles.add(roleId);
          },
        },
      });
    } catch (error) {
      console.error('[REACTION_ROLE] Error handling Fluxer reaction add:', error);
    }
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    if (!reaction.guildId) return;

    const guildId = reaction.guildId;
    const messageId = reaction.messageId;
    const emoji = reaction.emojiIdentifier;

    try {
      const guild = await client.guilds.resolve(guildId);
      if (!guild) return;

      const member = await guild.fetchMember(user.id);

      await reactionRoleService.handleReactionRemove(guildId, messageId, emoji, {
        roles: {
          remove: async (roleId: string) => {
            await member.roles.remove(roleId);
          },
        },
      });
    } catch (error) {
      console.error('[REACTION_ROLE] Error handling Fluxer reaction remove:', error);
    }
  });

  // Clean up reaction role bindings

  client.on(Events.MessageDelete, async (message) => {
    // PartialMessage has id, channelId, and channel
    const guildId =
      message.channel && 'guildId' in message.channel
        ? (message.channel as { guildId: string }).guildId
        : undefined;
    if (!guildId) return;

    try {
      const removed = await reactionRoleService.removeBindingsByMessage(guildId, message.id);
      if (removed > 0) {
        console.log(
          `[REACTION_ROLE] Cleaned up ${removed} binding(s) for deleted message ${message.id}`
        );
      }
    } catch (error) {
      console.error('[REACTION_ROLE] Error cleaning up Fluxer deleted message:', error);
    }
  });

  // Gracefully handle connection drops (sleep/wake, network blips)
  client.on('error', (err: Error) => {
    console.warn(t('fluxer.connectionError'), err.message);
  });

  // Join role event handlers
  client.on(Events.GuildMemberAdd, async (member: any) => {
    if (member.user?.bot) return;

    try {
      const guildId = member.guild?.id;
      if (!guildId) return;

      // Derive account creation date from the user's snowflake ID
      const accountCreatedAt = Math.floor(
        SnowflakeUtil.timestampFromSnowflake(member.user.id) / 1000
      );

      const result = await joinRoleService.handleMemberJoin(
        guildId,
        member.id,
        'fluxer',
        accountCreatedAt,
        member.joinedAt
          ? Math.floor(member.joinedAt.getTime() / 1000)
          : Math.floor(Date.now() / 1000)
      );

      if (result.assigned.length > 0) {
        console.log(
          `[JOINROLE] Assigned ${result.assigned.length} role(s) to ${member.user.username} in ${guildId}`
        );
      }
    } catch (error) {
      console.error('[JOINROLE] Error handling Fluxer member join:', error);
    }
  });

  client.on(Events.GuildMemberRemove, async (member: any) => {
    try {
      const guildId = member.guild?.id;
      if (!guildId) return;
      await joinRoleService.handleMemberLeave(guildId, member.id);
    } catch (error) {
      console.error('[JOINROLE] Error cleaning up Fluxer pending assignments:', error);
    }
  });

  const fluxerToken = process.env.FLUXER_TOKEN;
  if (!fluxerToken) {
    console.error(t('fluxer.tokenMissing'));
    process.exit(1); // Stop the bot
  }
  client.login(fluxerToken);

  return client;
}

/**
 * Fluxer guild aggregator.
 *
 * Fluxer doesn't support sharding yet, so this reads the local guild
 * cache. If the cache hasn't been populated by gateway GUILD_CREATE
 * events yet, it falls back to client.guilds.fetchGuilds() via the
 * REST API to populate it on demand.
 */
export class FluxerGuildAggregator implements GuildAggregator {
  constructor(private readonly client: Client) {}

  async getStats(): Promise<GuildStats> {
    const guildManager = (this.client as any).guilds;
    if (!guildManager) return { guildCount: 0, memberTotal: 0 };

    // Populate guild cache via REST if empty (only if client is ready)
    const needsFetch = guildManager.size === 0;
    if (needsFetch) {
      if (!this.client.isReady()) return { guildCount: 0, memberTotal: 0 };
      try {
        await guildManager.fetchGuilds();
      } catch {
        return { guildCount: 0, memberTotal: 0 };
      }
    }

    const guildCount = guildManager.size;
    let memberTotal = 0;
    try {
      const raw: any = await (this.client as any).rest.get('/users/@me/guilds?with_counts=true');
      const list: any[] = Array.isArray(raw) ? raw : (raw?.guilds ?? []);
      for (const g of list) {
        const c = g.approximate_member_count ?? g.member_count;
        if (c != null) memberTotal += c;
      }
    } catch {
      return { guildCount: 0, memberTotal: 0 };
    }

    return { guildCount, memberTotal };
  }
}

/**
 * Create an ActionDispatcher for the Fluxer platform.
 */
export function createFluxerActionDispatcher(client: Client): ActionDispatcher {
  return {
    platform: 'fluxer',

    async resolveChannel(_guildId: string, channelId: string): Promise<any | null> {
      try {
        const nativeChannel = await client.channels.resolve(channelId);
        if (!nativeChannel) return null;

        return {
          id: channelId,
          messages: {
            fetch: async (opts?: { limit?: number } | number): Promise<Map<string, any>> => {
              const limit = typeof opts === 'number' ? opts : (opts?.limit ?? 50);
              const raw: any[] = await client.rest.get(
                `/channels/${channelId}/messages?limit=${limit}`
              );
              return new Map((raw ?? []).map((m: any) => [m.id, m]));
            },
          },
          bulkDelete: async (messageIds: string[]): Promise<void> => {
            if (messageIds.length === 0) return;
            // Fluxer bulk-delete endpoint expects an array under "messages"
            await client.rest.post(`/channels/${channelId}/messages/bulk-delete`, {
              body: { messages: messageIds },
            });
          },
        };
      } catch {
        return null;
      }
    },

    async sendToChannel(
      _guildId: string,
      channelId: string,
      payload: string | { content?: string; embeds?: any[] }
    ): Promise<any> {
      return client.channels.send(channelId, payload);
    },
  };
}
