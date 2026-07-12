import { t } from '../core/i18n.js';
import { Client, GatewayIntentBits, type Message, Events } from 'discord.js';
import { RESTJSONErrorCodes } from 'discord-api-types/rest/v10';
import type { UnifiedMessage, UnifiedAuthor, UnifiedChannel } from '../core/types.js';
import { handleIncomingMessage, awardMessageXp } from '../core/router.js';
import { deployCommands } from '../core/deploy.js';
import { reminderService } from '../core/services/reminders/reminderService.js';
import { reactionRoleService } from '../core/services/reactionrole/reactionRoleService.js';
import type { GuildAggregator, GuildStats, ActionDispatcher } from '../core/types.js';

/** Tracks the bot's presence status so setStatus and setPresence compose cleanly. */
let currentPresenceStatus: 'online' | 'idle' | 'dnd' | 'invisible' = 'online';

export function startDiscordBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
  });

  client.once(Events.ClientReady, async () => {
    // Auto-deploy slash commands on startup (unless unchanged)
    deployCommands();

    // Reconcile existing reactions on startup
    reconcileReactionRoles(client);

    reminderService.on('reminderDue', async ({ reminder }) => {
      if (reminder.platform !== 'discord') return;
      try {
        const channel = await client.channels.fetch(reminder.channelId);
        if (!channel || !('send' in channel) || typeof channel.send !== 'function') return;

        type TC = {
          send: (content: string) => Promise<unknown>;
          messages: {
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
        if (reminder.referenceMessageId) {
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
        console.error(t('reminder.failedDispatchDiscord'), error);
      }
    });
    console.log(t('reminder.listeningDiscord'));
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // Build channel abstraction
    const channel: UnifiedChannel = {
      id: interaction.channelId,
      canManageMessages: async () => {
        let ch: any = interaction.channel ?? null;
        if (!ch && interaction.guild) {
          try {
            ch = await interaction.guild.channels.fetch(interaction.channelId);
          } catch {
            return false;
          }
        }
        if (!ch || typeof ch.bulkDelete !== 'function') return false;
        const me = interaction.guild?.members.me;
        if (!me) return false;
        return ch.permissionsFor(me)?.has('ManageMessages') ?? false;
      },
      userCanManageMessages: async () => {
        let ch: any = interaction.channel ?? null;
        if (!ch && interaction.guild) {
          try {
            ch = await interaction.guild.channels.fetch(interaction.channelId);
          } catch {
            return false;
          }
        }
        if (!ch || typeof ch.bulkDelete !== 'function') return false;
        const member = (interaction as any).member;
        if (!member) return false;
        return ch.permissionsFor(member)?.has('ManageMessages') ?? false;
      },
      userCanManageGuild: async () => {
        let ch: any = interaction.channel ?? null;
        if (!ch && interaction.guild) {
          try {
            ch = await interaction.guild.channels.fetch(interaction.channelId);
          } catch {
            return false;
          }
        }
        if (!ch || typeof ch.bulkDelete !== 'function') return false;
        const member = (interaction as any).member;
        if (!member) return false;
        return ch.permissionsFor(member)?.has('ManageGuild') ?? false;
      },
      fetchMessage: async (messageId: string) => {
        let ch: any = interaction.channel ?? null;
        if (!ch && interaction.guild) {
          try {
            ch = await interaction.guild.channels.fetch(interaction.channelId);
          } catch {
            return null;
          }
        }
        if (ch && typeof ch.messages?.fetch === 'function') {
          try {
            const msg = await ch.messages.fetch(messageId);
            if (msg) return { id: msg.id, content: msg.content ?? '', channelId: ch.id };
          } catch {
            // Not in current channel
          }
        }
        // Search other text channels in the guild
        if (interaction.guild) {
          for (const [, channel] of interaction.guild.channels.cache) {
            if (channel.id === interaction.channelId) continue;
            if ('messages' in channel && typeof (channel as any).messages?.fetch === 'function') {
              try {
                const msg = await (channel as any).messages.fetch(messageId);
                if (msg) return { id: msg.id, content: msg.content ?? '', channelId: channel.id };
              } catch {
                continue;
              }
            }
          }
        }
        return null;
      },
      resolveEmoji: async (emoji: string) => emoji,
      reactToMessage: async (channelId: string, messageId: string, emoji: string) => {
        try {
          const ch = interaction.guild
            ? await interaction.guild.channels.fetch(channelId)
            : await client.channels.fetch(channelId);
          if (!ch || typeof (ch as any).messages?.fetch !== 'function') return;
          const msg = await (ch as any).messages.fetch(messageId);
          if (msg) await msg.react(emoji);
        } catch {
          // Best-effort
        }
      },
      removeReactionFromMessage: async (channelId: string, messageId: string, emoji: string) => {
        try {
          const ch = interaction.guild
            ? await interaction.guild.channels.fetch(channelId)
            : await client.channels.fetch(channelId);
          if (!ch || typeof (ch as any).messages?.fetch !== 'function') return;
          const msg = await (ch as any).messages.fetch(messageId);
          if (msg) await msg.removeReaction(emoji);
        } catch {
          // Best-effort
        }
      },
      fetchMessages: async (limit: number) => {
        let ch: any = interaction.channel ?? null;
        if (!ch && interaction.guild) {
          try {
            ch = await interaction.guild.channels.fetch(interaction.channelId);
          } catch {
            return [];
          }
        }
        if (!ch || typeof ch.bulkDelete !== 'function') return [];
        try {
          const messages = await ch.messages.fetch({ limit });
          return [...messages.values()].map((m: any) => ({
            id: m.id,
            authorId: m.author.id,
            createdAt: new Date(m.createdTimestamp),
          }));
        } catch {
          return [];
        }
      },
      bulkDelete: async (messageIds: string[]) => {
        let ch: any = interaction.channel ?? null;
        if (!ch && interaction.guild) {
          ch = await interaction.guild.channels.fetch(interaction.channelId);
        }
        if (!ch || typeof ch.bulkDelete !== 'function') {
          throw new Error('Cannot bulk delete in this channel');
        }
        await ch.bulkDelete(messageIds, true);
      },
    };

    const author: UnifiedAuthor = {
      id: interaction.user.id,
      username: interaction.user.username,
      avatarUrl: interaction.user.displayAvatarURL({ size: 1024 }),
    };

    // Map to UnifiedMessage
    const unified: UnifiedMessage = {
      id: interaction.id,
      content: interaction.commandName,
      author,
      channel,
      client: client,
      ...(interaction.guildId ? { guildId: interaction.guildId } : {}),
      platform: 'discord',
      interaction: interaction,
      deferReply: async () => {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply();
        }
      },
      fetchUser: async (userId) => {
        try {
          const user = await interaction.client.users.fetch(userId);
          return {
            username: user.tag,
            avatarUrl: user.displayAvatarURL({ size: 1024 }),
            bot: user.bot,
          };
        } catch {
          return null;
        }
      },
      reply: async (response) => {
        if (typeof response === 'string') {
          if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(response);
          }
          return await interaction.reply(response);
        }
        const opts: Record<string, unknown> = {};
        opts.content = response.content;
        if (response.files?.length) {
          opts.files = response.files.map((f) => {
            if ('name' in f) {
              return { attachment: f.data, name: f.name };
            }
            return { attachment: f, name: 'image.png' };
          });
        }
        if (response.embeds?.length) {
          opts.embeds = response.embeds;
        }
        if (interaction.deferred || interaction.replied) {
          return await interaction.editReply(opts);
        }
        return await interaction.reply(opts);
      },
      edit: async (text) => {
        return await interaction.editReply(text);
      },
      followUp: async (text) => {
        if (interaction.deferred || interaction.replied) {
          return await interaction.followUp({ content: text, ephemeral: true });
        }
        return await interaction.reply(text);
      },
      setStatus: async ({ text, emojiName, emojiId }) => {
        // For custom emojis, reconstruct the full syntax so Discord renders the image
        const displayEmoji = emojiId && emojiName ? `<:${emojiName}:${emojiId}>` : emojiName;
        const activityName = displayEmoji ? `${displayEmoji} ${text}` : text;
        await client.user?.setPresence({
          activities: [{ name: activityName, type: 4 }],
          status: currentPresenceStatus,
        });
      },
      setPresence: async (status) => {
        currentPresenceStatus = status;
        await client.user?.setPresence({ status });
      },
    };

    // Send to Router
    await handleIncomingMessage(unified, true);

    // Award XP for slash command usage
    await awardMessageXp(unified);
  });

  // Handle regular messages for XP
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.guildId) return;

    const channel: UnifiedChannel = {
      id: message.channelId,
      canManageMessages: async () => {
        try {
          const ch: any = message.channel;
          if (!ch || typeof ch.bulkDelete !== 'function') return false;
          const me = message.guild?.members.me;
          if (!me) return false;
          return ch.permissionsFor(me)?.has('ManageMessages') ?? false;
        } catch {
          return false;
        }
      },
      userCanManageMessages: async () => false,
      userCanManageGuild: async () => false,
      fetchMessage: async (messageId: string) => {
        try {
          const ch: any = message.channel;
          const msg = await ch.messages.fetch(messageId);
          if (msg) return { id: msg.id, content: msg.content ?? '', channelId: ch.id };
        } catch {
          // Not in current channel — try other guild channels
        }
        // Search other text channels in the guild
        if (message.guild) {
          for (const [, channel] of message.guild.channels.cache) {
            if (channel.id === message.channelId) continue;
            if ('messages' in channel && typeof (channel as any).messages?.fetch === 'function') {
              try {
                const msg = await (channel as any).messages.fetch(messageId);
                if (msg) return { id: msg.id, content: msg.content ?? '', channelId: channel.id };
              } catch {
                continue;
              }
            }
          }
        }
        return null;
      },
      resolveEmoji: async (emoji: string) => emoji,
      reactToMessage: async (channelId: string, messageId: string, emoji: string) => {
        try {
          const guild = client.guilds.cache.get(message.guildId!);
          const ch = guild
            ? await guild.channels.fetch(channelId)
            : await client.channels.fetch(channelId);
          if (!ch || typeof (ch as any).messages?.fetch !== 'function') return;
          const msg = await (ch as any).messages.fetch(messageId);
          if (msg) await msg.react(emoji);
        } catch {
          // Best-effort
        }
      },
      removeReactionFromMessage: async (channelId: string, messageId: string, emoji: string) => {
        try {
          const guild = client.guilds.cache.get(message.guildId!);
          const ch = guild
            ? await guild.channels.fetch(channelId)
            : await client.channels.fetch(channelId);
          if (!ch || typeof (ch as any).messages?.fetch !== 'function') return;
          const msg = await (ch as any).messages.fetch(messageId);
          if (msg) await msg.removeReaction(emoji);
        } catch {
          // Best-effort
        }
      },
      fetchMessages: async (limit: number) => {
        try {
          const ch: any = message.channel;
          const messages = await ch.messages.fetch({ limit });
          return [...messages.values()].map((m: any) => ({
            id: m.id,
            authorId: m.author.id,
            createdAt: new Date(m.createdTimestamp),
          }));
        } catch {
          return [];
        }
      },
      bulkDelete: async (messageIds: string[]) => {
        const ch: any = message.channel;
        await ch.bulkDelete(messageIds, true);
      },
    };

    const author: UnifiedAuthor = {
      id: message.author.id,
      username: message.author.username,
      avatarUrl: message.author.displayAvatarURL({ size: 1024 }),
    };

    const unified: UnifiedMessage = {
      id: message.id,
      content: message.content,
      author,
      channel,
      client: client,
      guildId: message.guildId,
      platform: 'discord',
      fetchUser: async (userId) => {
        try {
          const user = await client.users.fetch(userId);
          return {
            username: user.tag,
            avatarUrl: user.displayAvatarURL({ size: 1024 }),
            bot: user.bot,
          };
        } catch {
          return null;
        }
      },
      reply: async (response) => {
        if (typeof response === 'string') {
          return await message.reply(response);
        }
        const opts: Record<string, unknown> = {};
        opts.content = response.content;
        if (response.files?.length) {
          opts.files = response.files.map((f) => {
            if ('name' in f) {
              return { attachment: f.data, name: f.name };
            }
            return { attachment: f, name: 'image.png' };
          });
        }
        if (response.embeds?.length) {
          opts.embeds = response.embeds;
        }
        return await message.reply(opts);
      },
    } as UnifiedMessage;

    await awardMessageXp(unified);
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    if (!reaction.message.guildId) return;

    // For uncached messages, fetch the partial
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }

    const guildId = reaction.message.guildId;
    const messageId = reaction.message.id;
    const emoji = reaction.emoji.id
      ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
      : reaction.emoji.name!;

    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(user.id);

      await reactionRoleService.handleReactionAdd(guildId, messageId, emoji, {
        roles: {
          add: async (roleId: string) => {
            const role = guild.roles.cache.get(roleId);
            if (role) await member.roles.add(role);
          },
        },
      });
    } catch {
      // Ignored
    }
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    if (!reaction.message.guildId) return;

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }

    const guildId = reaction.message.guildId;
    const messageId = reaction.message.id;
    const emoji = reaction.emoji.id
      ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
      : reaction.emoji.name!;

    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(user.id);

      await reactionRoleService.handleReactionRemove(guildId, messageId, emoji, {
        roles: {
          remove: async (roleId: string) => {
            const role = guild.roles.cache.get(roleId);
            if (role) await member.roles.remove(role);
          },
        },
      });
    } catch {
      // Ignored
    }
  });

  // Clean up reaction role bindings
  client.on(Events.MessageDelete, async (message) => {
    if (!message.guildId) return;

    // For uncached messages, the ID is still available (partial)
    const guildId = message.guildId;
    const messageId = message.id;

    try {
      await reactionRoleService.removeBindingsByMessage(guildId, messageId);
    } catch {
      // Ignored
    }
  });

  client.login(process.env.DISCORD_TOKEN);

  return client;
}

/**
 * Reconcile existing reactions on startup.
 * Scans all reaction role bindings and assigns roles to users who
 * already have the reaction, catching any missed assignments.
 */
async function reconcileReactionRoles(client: Client): Promise<void> {
  try {
    const bindings = await reactionRoleService.getAllBindings('discord');

    if (bindings.length === 0) return;

    const byGuild = new Map<string, typeof bindings>();
    for (const b of bindings) {
      if (!byGuild.has(b.guildId)) {
        byGuild.set(b.guildId, []);
      }
      byGuild.get(b.guildId)!.push(b);
    }

    for (const [guildId, guildBindings] of byGuild) {
      try {
        const guild = await client.guilds.fetch(guildId);

        const byMessage = new Map<string, typeof guildBindings>();
        for (const b of guildBindings) {
          if (!byMessage.has(b.messageId)) {
            byMessage.set(b.messageId, []);
          }
          byMessage.get(b.messageId)!.push(b);
        }

        // Ensure channels are loaded so we can search for the bound messages
        await guild.channels.fetch();

        for (const [messageId, messageBindings] of byMessage) {
          let cleanedUp = false;
          try {
            let message: any = null;
            for (const [, channel] of guild.channels.cache) {
              if ('messages' in channel && typeof (channel as any).messages?.fetch === 'function') {
                try {
                  message = await (channel as any).messages.fetch(messageId);
                  if (message) {
                    break;
                  }
                } catch (err: any) {
                  if (err.code === RESTJSONErrorCodes.UnknownMessage) {
                    if (!cleanedUp) {
                      await reactionRoleService.removeBindingsByMessage(guildId, messageId);
                      cleanedUp = true;
                    }
                  } else {
                    // Fetch error — skip channel
                  }
                }
              }
            }

            if (!message) continue;

            for (const binding of messageBindings) {
              const emojiStr = binding.emoji;

              const reaction = message.reactions.cache.find((r: any) => {
                const rEmoji = r.emoji.id ? `<:${r.emoji.name}:${r.emoji.id}>` : r.emoji.name;
                return rEmoji === emojiStr;
              });

              if (!reaction) continue;

              const users = await reaction.users.fetch();

              for (const [, user] of users) {
                if (user.bot) continue;

                try {
                  const member = await guild.members.fetch(user.id);

                  if (!member.roles.cache.has(binding.roleId)) {
                    const role = guild.roles.cache.get(binding.roleId);
                    if (role) {
                      await member.roles.add(role);
                    }
                  }
                } catch {
                  // Ignored
                }
              }
            }
          } catch {
            // Ignored
          }
        }
      } catch {
        // Ignored
      }
    }
  } catch {
    // Ignored
  }
}

/**
 * Discord guild aggregator that handles both sharded and unsharded modes.
 *
 * **Unsharded** (current): reads `client.guilds.cache` directly — O(guilds)
 *   in a single process.
 *
 * **Sharded** (future): uses `fetchClientValues` and `broadcastEval` to
 *   collect guild/member counts from every shard via built-in
 *   IPC — O(shards) regardless of total guild count.
 *
 * Both paths return a single `{ guildCount, memberTotal }` that the
 * snapshot service writes to the database.
 */
export class DiscordGuildAggregator implements GuildAggregator {
  constructor(private readonly client: Client) {}

  async getStats(): Promise<GuildStats> {
    if (!this.client.isReady()) {
      return { guildCount: 0, memberTotal: 0 };
    }
    if (this.client.shard) {
      return this.getShardedStats();
    }
    return this.getLocalStats();
  }

  private getLocalStats(): GuildStats {
    const guildCount = this.client.guilds.cache.size;
    const memberTotal = this.client.guilds.cache.reduce((sum, guild) => sum + guild.memberCount, 0);
    return { guildCount, memberTotal };
  }

  private async getShardedStats(): Promise<GuildStats> {
    const shard = this.client.shard!;

    // Ask every shard for its guild count — single IPC call
    const guildCounts = (await shard.fetchClientValues('guilds.cache.size')) as number[];
    const guildCount = guildCounts.reduce((sum, count) => sum + count, 0);

    // Ask every shard to sum its own member counts — single IPC call
    const memberTotals = (await shard.broadcastEval((c) =>
      (c as Client).guilds.cache.reduce((sum, guild) => sum + guild.memberCount, 0)
    )) as number[];
    const memberTotal = memberTotals.reduce((sum, count) => sum + count, 0);

    return { guildCount, memberTotal };
  }
}

/**
 * Create an ActionDispatcher for the Discord platform.
 */
export function createDiscordActionDispatcher(client: Client): ActionDispatcher {
  return {
    platform: 'discord',

    async resolveChannel(guildId: string, channelId: string): Promise<any | null> {
      try {
        const guild = await client.guilds.fetch(guildId);
        return await guild.channels.fetch(channelId);
      } catch {
        try {
          return await client.channels.fetch(channelId);
        } catch {
          return null;
        }
      }
    },

    async sendToChannel(
      guildId: string,
      channelId: string,
      payload: string | { content?: string; embeds?: any[] }
    ): Promise<any> {
      let ch: any;
      try {
        const guild = await client.guilds.fetch(guildId);
        ch = await guild.channels.fetch(channelId);
      } catch {
        ch = await client.channels.fetch(channelId);
      }
      if (!ch || typeof ch.send !== 'function') {
        throw new Error('Channel not found or bot cannot send messages there.');
      }
      return ch.send(payload);
    },
  };
}
