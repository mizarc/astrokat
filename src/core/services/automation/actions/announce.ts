import type { Action, ActionContext, ActionResult } from '../actionTypes.js';

/**
 * Posts a message or embed to a configured channel.
 *
 * Config:
 *   channel: target channel ID
 *   message: text content (supports {guild}, {user} placeholders)
 *   embed?: { title?: string; description?: string; color?: number }
 */
export const AnnounceAction: Action = {
  name: 'announce',
  description: 'Post a message or embed to a channel.',
  requiredConfig: ['message'],

  async execute(context: ActionContext): Promise<ActionResult> {
    const { channelId, config, sendToChannel } = context;

    const message = config.message as string | undefined;
    const embed = config.embed as
      | { title?: string; description?: string; color?: number }
      | undefined;

    if (!message && !embed) {
      return { success: false, error: 'No message or embed content configured.' };
    }

    if (!sendToChannel) {
      return {
        success: false,
        error: `Cannot send messages — no send function available.`,
      };
    }

    const resolvedMessage = message ? message.replace(/\{guild\}/g, context.guildId) : undefined;

    const payload: Record<string, unknown> = {};
    if (resolvedMessage) payload.content = resolvedMessage;
    if (embed) {
      payload.embeds = [
        {
          title: embed.title,
          description: embed.description,
          color: embed.color,
        },
      ];
    }

    try {
      await sendToChannel(payload);
      return { success: true, message: 'Announcement sent.' };
    } catch (error) {
      return {
        success: false,
        error: `Failed to send to <#${channelId}>: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
