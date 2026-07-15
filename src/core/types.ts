// src/core/types.ts
import type { ChatInputCommandInteraction } from 'discord.js';

export interface ReplyEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: { text: string };
}

export interface ReplyOptions {
  content: string;
  files?: (Buffer | { name: string; data: Buffer })[];
  embeds?: ReplyEmbed[];
}

/** Lightweight message representation returned by fetchMessages. */
export interface ChannelMessage {
  id: string;
  authorId: string;
  createdAt: Date;
}

/** Represents a user/author across any platform. */
export interface UnifiedAuthor {
  id: string;
  username: string;
  avatarUrl?: string;
}

/**
 * Represents a channel with platform-specific operations.
 * Each adapter implements these methods; commands call them without
 * caring which platform they're on.
 */
export interface UnifiedChannel {
  id: string;
  fetchMessages?: (limit: number) => Promise<ChannelMessage[]>;
  fetchMessage?: (
    messageId: string
  ) => Promise<{ id: string; content: string; channelId: string } | null>;
  reactToMessage?: (channelId: string, messageId: string, emoji: string) => Promise<void>;
  /** Remove the bot's reaction from a message (best-effort). */
  removeReactionFromMessage?: (
    channelId: string,
    messageId: string,
    emoji: string
  ) => Promise<void>;
  /** Normalise an emoji string to the platform's canonical storage format. */
  resolveEmoji?: (emoji: string) => Promise<string>;
  bulkDelete?: (messageIds: string[]) => Promise<void>;
  canManageMessages?: () => Promise<boolean>;
  userCanManageMessages?: () => Promise<boolean>;
  userCanManageGuild?: () => Promise<boolean>;
}

export interface UnifiedMessage {
  id: string;
  content: string;
  author: UnifiedAuthor;
  channel: UnifiedChannel;
  interaction?: ChatInputCommandInteraction;
  client?: any;
  platform: 'discord' | 'fluxer';
  guildId?: string;

  /**
   * Fetches a user's username and avatar URL by their ID.
   * Returns null if the user cannot be found.
   */
  fetchUser?: (
    userId: string
  ) => Promise<{ username: string; avatarUrl: string; bot?: boolean } | null>;

  /**
   * Defers the reply to buy more time before responding.
   * On Discord this prevents the 3-second interaction timeout.
   * On other platforms this is typically a no-op.
   */
  deferReply?: () => Promise<void>;

  /**
   * Universal method to send a reply back to the originating platform.
   * Accepts plain text or an object with content and optional file buffers.
   */
  reply: (response: string | ReplyOptions) => Promise<any>;

  /**
   * Universal method to edit the last sent reply.
   */
  edit: (content: string) => Promise<any>;

  /**
   * Sends a follow-up message after the initial reply has been sent or deferred.
   * On Discord this uses interaction.followUp to create a new message instead of
   * editing the deferred response. Falls back to reply() if not available.
   */
  followUp?: (content: string) => Promise<any>;

  /**
   * Sets the bot's custom status text across the platform.
   * Only available if the caller is the bot owner (checked by the command).
   */
  setStatus?: (opts: {
    text: string;
    emojiName?: string | null;
    emojiId?: string | null;
  }) => Promise<void>;

  /**
   * Sets the bot's presence (online/idle/dnd/invisible) across the platform.
   * Only available if the caller is the bot owner (checked by the command).
   */
  setPresence?: (status: 'online' | 'idle' | 'dnd' | 'invisible') => Promise<void>;

  /**
   * The bot's own user ID on this platform.
   * Used for mention-based command invocation (e.g. `@Astrokat help`)
   * to distinguish commands even when other bots share the same prefix.
   */
  botUserId?: string;
}

/** Supported command parameter types (maps to Discord API option types). */
export type CommandParameterType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'user'
  | 'channel'
  | 'role'
  | 'mentionable'
  | 'attachment';

/** Describes a single command parameter for slash command deployment. */
export interface CommandParameter {
  name: string;
  description: string;
  type: CommandParameterType;
  required?: boolean;
  minValue?: number;
  maxValue?: number;
}

/** Describes a subcommand for a parent command (e.g. !system ratelimit). */
export interface BotSubcommand {
  name: string;
  description: string;
  parameters?: CommandParameter[];
  /** Nested subcommands — when set, this subcommand deploys as a subcommand group. */
  subcommands?: BotSubcommand[];
}

export interface BotCommand {
  name: string;
  description: string;
  category:
    | 'automation'
    | 'knowledge'
    | 'social'
    | 'utility'
    | 'moderation'
    | 'operation'
    | 'administration';
  execute: (message: UnifiedMessage, args: string[]) => Promise<void>;
  /** Optional parameter definitions for slash command deployment. */
  parameters?: CommandParameter[];
  /** Subcommand definitions — when set, the command is deployed as a subcommand group. */
  subcommands?: BotSubcommand[];
  /**
   * Discord permission strings required to use this command.
   * When set, the slash command is hidden from users without the permission
   * (Discord-side gating), and the command itself should also verify at runtime.
   * Example: ['ManageMessages']
   */
  requiredPermissions?: string[];
}

/**
 * Result of aggregating guild stats from an adapter client.
 */
export interface GuildStats {
  guildCount: number;
  memberTotal: number;
}

/**
 * Platform-agnostic abstraction for counting guilds and members.
 *
 * Each adapter (Discord, Fluxer, etc.) provides its own implementation.
 * This keeps the snapshot service completely decoupled from any specific
 * platform or sharding strategy.
 */
export interface GuildAggregator {
  /**
   * Count all guilds the bot is in and sum their member counts.
   *
   * For sharded Discord bots, this uses cross-shard IPC internally so
   * one shard can collect data from all shards. For unsharded setups,
   * it reads the local cache directly.
   */
  getStats(): Promise<GuildStats>;
}

/**
 * Platform-agnostic action dispatch interface for automated actions.
 *
 * Each adapter exports a factory that creates an ActionDispatcher wrapping
 * its platform-specific client. This keeps the cron engine entirely
 * decoupled from platform internals.
 */
export interface ActionDispatcher {
  /** Human-readable platform identifier. */
  readonly platform: 'discord' | 'fluxer';

  /**
   * Resolve a channel by ID within a guild.
   * Returns the channel object if found, or null if the channel
   * doesn't exist or the bot can't access it.
   */
  resolveChannel(guildId: string, channelId: string): Promise<any | null>;

  /**
   * Send a message or embed to a channel.
   * Payload can be a plain string or an object with content/embeds.
   */
  sendToChannel(
    guildId: string,
    channelId: string,
    payload: string | { content?: string; embeds?: any[] }
  ): Promise<any>;
}
