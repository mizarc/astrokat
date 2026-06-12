import { t } from '../core/i18n.js';
import { Client, GatewayIntentBits, type Message, Events } from 'discord.js';
import type { UnifiedMessage, UnifiedAuthor, UnifiedChannel } from '../core/types.js';
import { handleIncomingMessage, awardMessageXp } from '../core/router.js';
import { deployCommands } from '../core/deploy.js';
import { reminderService } from '../core/services/reminders/reminderService.js';

/** Tracks the bot's presence status so setStatus and setPresence compose cleanly. */
let currentPresenceStatus: 'online' | 'idle' | 'dnd' | 'invisible' = 'online';

export function startDiscordBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, () => {
    // Auto-deploy slash commands on startup (unless unchanged)
    deployCommands();

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
        const contentWithMention = t('reminder.dueMention', { userId: reminder.userId, message: reminder.message });

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
      fetchUser: async (userId) => {
        try {
          const user = await interaction.client.users.fetch(userId);
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
            username: user.username,
            avatarUrl: user.displayAvatarURL({ size: 1024 }),
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

  client.login(process.env.DISCORD_TOKEN);
}