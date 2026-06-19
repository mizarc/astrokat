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
  fetchUser?: (userId: string) => Promise<{ username: string; avatarUrl: string } | null>;

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

export interface BotCommand {
  name: string;
  description: string;
  category: 'automation' | 'knowledge' | 'social' | 'utility' | 'moderation' | 'system';
  execute: (message: UnifiedMessage, args: string[]) => Promise<void>;
  /** Optional parameter definitions for slash command deployment. */
  parameters?: CommandParameter[];
  /**
   * Discord permission strings required to use this command.
   * When set, the slash command is hidden from users without the permission
   * (Discord-side gating), and the command itself should also verify at runtime.
   * Example: ['ManageMessages']
   */
  requiredPermissions?: string[];
}
