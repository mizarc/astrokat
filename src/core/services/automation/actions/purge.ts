import type { Action, ActionContext, ActionResult } from '../actionTypes.js';

/**
 * Bulk-deletes recent messages in a channel.
 *
 * Config:
 *   channel: target channel ID
 *   count: number of messages to delete (default 50, max 100)
 */
export const PurgeAction: Action = {
  name: 'purge',
  description: 'Bulk-delete recent messages in a channel.',
  configFields: [
    { key: 'channel', description: 'Target channel to purge messages from', required: true },
    {
      key: 'count',
      description: 'Number of messages to delete (default 50, max 100)',
      required: false,
    },
  ],

  async execute(context: ActionContext): Promise<ActionResult> {
    const { channelId, config, channel } = context;

    const count = Math.min(Math.max(typeof config.count === 'number' ? config.count : 50, 1), 100);

    if (!channel) {
      return {
        success: false,
        error: `<#${channelId}> not found. Check the channel still exists.`,
      };
    }

    try {
      const messages = (await channel.messages.fetch({
        limit: count,
      })) as Map<string, any>;
      const ids = [...messages.keys()];

      if (ids.length === 0) {
        return { success: true, message: 'No messages to purge.' };
      }

      if (channel.bulkDelete) {
        await channel.bulkDelete(ids);
      } else {
        // Fallback: delete one by one
        for (const id of ids) {
          try {
            const msg = await channel.messages.fetch(id);
            if (msg && typeof (msg as any).delete === 'function') {
              await (msg as any).delete();
            }
          } catch {
            // Skip messages we can't delete
          }
        }
      }

      return { success: true, message: `Purged ${ids.length} message(s) in <#${channelId}>.` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to purge messages.',
      };
    }
  },
};
