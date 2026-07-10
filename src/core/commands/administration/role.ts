import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';
import { reactionRoleService } from '../../services/reactionrole/reactionRoleService.js';

/**
 * Parse a role mention or ID from a string.
 * Discord mentions look like <@&123456789>, raw IDs are just digits.
 */
function parseRoleId(input: string): string | null {
  const mentionMatch = input.match(/^<@&(\d+)>$/);
  if (mentionMatch && mentionMatch[1]) return mentionMatch[1];
  if (/^\d+$/.test(input)) return input;
  return null;
}

export const RoleCommand: BotCommand = {
  name: 'role',
  description: 'Role management — reaction roles, level roles, and join roles.',
  category: 'administration',
  requiredPermissions: ['ManageRoles'],
  subcommands: [
    {
      name: 'reaction',
      description: 'Manage reaction role bindings for this server.',
      subcommands: [
        {
          name: 'add',
          description:
            'Bind an emoji to a role on a message. Reacting with the emoji gives the role.',
          parameters: [
            {
              name: 'message_id',
              description: 'The ID of the message to bind to.',
              type: 'string',
              required: true,
            },
            {
              name: 'emoji',
              description: 'The emoji to react with (e.g. 🎉 or :custom:123).',
              type: 'string',
              required: true,
            },
            {
              name: 'role',
              description: 'The role to assign when this emoji is used.',
              type: 'role',
              required: true,
            },
          ],
        },
        {
          name: 'remove',
          description: 'Remove an emoji-to-role binding from a message.',
          parameters: [
            {
              name: 'message_id',
              description: 'The ID of the message to unbind from.',
              type: 'string',
              required: true,
            },
            {
              name: 'emoji',
              description: 'The emoji to unbind.',
              type: 'string',
              required: true,
            },
          ],
        },
        {
          name: 'list',
          description: 'List all reaction role bindings, optionally filtered by message.',
          parameters: [
            {
              name: 'message_id',
              description: 'Optional message ID to filter by.',
              type: 'string',
              required: false,
            },
          ],
        },
      ],
    },
  ],
  async execute(message, args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('role.guildOnly'));
      return;
    }

    // Check permissions
    if (message.channel?.userCanManageGuild) {
      const canManage = await message.channel.userCanManageGuild();
      if (!canManage) {
        await message.reply(t('role.noPermission'));
        return;
      }
    }

    const sub = args[0]?.toLowerCase();

    if (!sub) {
      await message.reply(t('role.help'));
      return;
    }

    if (sub === 'reaction') {
      const action = args[1]?.toLowerCase();
      switch (action) {
        case 'add':
          return handleReactionAdd(message, args.slice(2));
        case 'remove':
          return handleReactionRemove(message, args.slice(2));
        case 'list':
          return handleReactionList(message, args.slice(2));
        default:
          await message.reply(t('role.help'));
      }
      return;
    }

    await message.reply(t('role.help'));
  },
};

async function handleReactionAdd(message: any, args: string[]) {
  const guildId = message.guildId!;

  if (args.length < 3) {
    await message.reply(t('role.reaction.add.usage'));
    return;
  }

  const messageId = args[0]!;
  const emoji = args[1]!;
  const roleInput = args[2]!;

  // Parse role ID from mention or raw ID
  const roleId = parseRoleId(roleInput);
  if (!roleId) {
    await message.reply(t('role.reaction.add.invalidRole'));
    return;
  }

  try {
    const binding = await reactionRoleService.addBinding({
      guildId,
      messageId,
      emoji,
      roleId,
    });

    await message.reply(
      t('role.reaction.add.success', {
        emoji,
        roleId,
        messageId: binding.messageId,
      })
    );
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    await message.reply(t('role.reaction.add.error', { error: errMessage }));
  }
}

async function handleReactionRemove(message: any, args: string[]) {
  const guildId = message.guildId!;

  if (args.length < 2) {
    await message.reply(t('role.reaction.remove.usage'));
    return;
  }

  const messageId = args[0]!;
  const emoji = args[1]!;

  const removed = await reactionRoleService.removeBinding(guildId, messageId, emoji);

  if (!removed) {
    await message.reply(t('role.reaction.remove.notFound'));
    return;
  }

  await message.reply(t('role.reaction.remove.success', { emoji, messageId }));
}

async function handleReactionList(message: any, args: string[]) {
  const guildId = message.guildId!;

  const messageId = args[0] || undefined;

  const bindings = await reactionRoleService.listBindings(guildId, messageId);

  if (bindings.length === 0) {
    await message.reply(t('role.reaction.list.empty'));
    return;
  }

  // Group by message for readability
  const grouped = new Map<string, typeof bindings>();
  for (const b of bindings) {
    if (!grouped.has(b.messageId)) {
      grouped.set(b.messageId, []);
    }
    grouped.get(b.messageId)!.push(b);
  }

  const lines: string[] = [];
  for (const [msgId, binds] of grouped) {
    lines.push(t('role.reaction.list.messageHeader', { messageId: msgId }));
    for (const b of binds) {
      lines.push(t('role.reaction.list.entry', { emoji: b.emoji, roleId: b.roleId }));
    }
    lines.push('');
  }

  await message.reply({
    content: '',
    embeds: [
      {
        title: t('role.reaction.list.title'),
        description: lines.join('\n').trimEnd(),
        color: 0x5865f2,
      },
    ],
  });
}
