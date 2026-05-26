// src/core/types.ts
import type { ChatInputCommandInteraction } from 'discord.js';

export interface UnifiedMessage {
  id: string;
  content: string;
  userId: string;
  username: string;
  channelId: string;
  interaction?: ChatInputCommandInteraction;
  platform: 'discord' | 'fluxer';
  
  /**
   * Universal method to send a reply back to the originating platform.
   */
  reply: (content: string) => Promise<void>;
}

export interface BotCommand {
  name: string;
  description: string;
  category: 'automation' | 'knowledge' | 'social' | 'utility';
  execute: (message: UnifiedMessage, args: string[]) => Promise<void>;
}