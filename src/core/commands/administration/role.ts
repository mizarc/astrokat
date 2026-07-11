import { t } from '../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../types.js';
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
      await showHelp(message);
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
          await showHelp(message);
      }
      return;
    }

    await showHelp(message);
  },
};

async function showHelp(message: any): Promise<void> {
  const embed: ReplyEmbed = {
    title: '📋 Role Management',
    color: 0x5865f2,
    description: [
      '**Reaction Roles**',
      '',
      `\`!role reaction add <message-id> <emoji> <role>\` — ${t('role.reaction.add.description')}`,
      `\`!role reaction remove <message-id> <emoji>\` — ${t('role.reaction.remove.description')}`,
      `\`!role reaction list [message-id]\` — ${t('role.reaction.list.description')}`,
    ].join('\n'),
  };
  await message.reply({ content: '', embeds: [embed] });
}

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

  // Try to fetch a message preview (best-effort)
  let preview: string | null = null;
  if (message.channel?.fetchMessage) {
    const msg = await message.channel.fetchMessage(messageId);
    if (msg?.content) {
      preview = msg.content.slice(0, 30).replace(/\n/g, ' ');
      if (msg.content.length > 30) preview += '…';
    }
  }

  try {
    const binding = await reactionRoleService.addBinding({
      guildId,
      messageId,
      emoji,
      roleId,
      platform: message.platform as string,
    });

    const base = t('role.reaction.add.success', {
      emoji,
      roleId,
      messageId: binding.messageId,
    });
    const reply = preview ? `${base}\n> ${preview}` : base;
    await message.reply(reply);
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

  const entries = [...grouped.entries()];
  const total = bindings.length;
  const shown = Math.min(total, 10);
  let shownCount = 0;

  const lines: string[] = [];
  for (let i = 0; i < entries.length && shownCount < shown; i++) {
    const [msgId, binds] = entries[i]!;

    for (const b of binds) {
      if (shownCount >= shown) break;

      // Best-effort fetch of message preview
      let preview: string | null = null;
      if (message.channel?.fetchMessage && !preview) {
        const msg = await message.channel.fetchMessage(msgId);
        if (msg?.content) {
          preview = msg.content.slice(0, 30).replace(/\n/g, ' ');
          if (msg.content.length > 30) preview += '…';
        }
      }

      if (preview) {
        lines.push(
          t('role.reaction.list.entryWithPreview', {
            index: shownCount + 1,
            emoji: b.emoji,
            roleId: b.roleId,
            messageId: msgId,
            preview,
          })
        );
      } else {
        lines.push(
          t('role.reaction.list.entry', {
            index: shownCount + 1,
            emoji: b.emoji,
            roleId: b.roleId,
            messageId: msgId,
          })
        );
      }
      shownCount++;
    }
  }

  const description = lines.join('\n').trimEnd();

  const embed: ReplyEmbed = {
    title: t('role.reaction.list.title'),
    description,
    color: 0x5865f2,
  };

  if (total > 10) {
    embed.footer = { text: t('role.reaction.list.footer', { shown, total }) };
  }

  await message.reply({ content: '', embeds: [embed] });
}
