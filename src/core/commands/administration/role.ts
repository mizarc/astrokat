import { t } from '../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../types.js';
import { reactionRoleService } from '../../services/reactionrole/reactionRoleService.js';
import { joinRoleService } from '../../services/joinrole/joinRoleService.js';
import { getUnicodeFromShortcode } from '@fluxerjs/util';

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

/**
 * Render an emoji for display.
 * Converts `:shortcode:` to unicode, and `<:name:id>` / `name:id` to `<:name:id>`
 * so custom emojis render on any platform.
 */
function displayEmoji(emoji: string): string {
  // Resolve :shortcode: to unicode
  const shortcodeMatch = emoji.match(/^:(\w+):$/);
  if (shortcodeMatch) {
    const unicode = getUnicodeFromShortcode(shortcodeMatch[1]!);
    if (unicode) return unicode;
  }
  // Strip Discord <a:name:id> animated prefix if present
  const cleaned = emoji.replace(/^<a?:/, '<:');
  // Already in <:name:id> format
  if (/^<:\w+:\d+>$/.test(cleaned)) return cleaned;
  // Strip stray colons, then wrap in <:name:id> if it's name:id
  const stripped = cleaned.replace(/^:+|:+$/g, '');
  const nameId = stripped.match(/^(\w+):(\d+)$/);
  if (nameId) return `<:${nameId[1]!}:${nameId[2]!}>`;
  return stripped;
}

/**
 * Build a clickable message link for the given platform.
 */
function messageLink(
  platform: string,
  guildId: string,
  channelId: string | null,
  messageId: string
): string {
  if (!channelId) return `\`${messageId}\``;
  const fluxerWebUrl = process.env.FLUXER_WEB_URL ?? 'https://web.fluxer.app';
  const base = platform === 'fluxer' ? `${fluxerWebUrl}/channels` : 'https://discord.com/channels';
  return `${base}/${guildId}/${channelId}/${messageId}`;
}

/**
 * Format a duration in minutes to a human-readable string.
 * e.g. 1440 -> "1d", 90 -> "1h 30m", 5 -> "5m"
 */
function formatDuration(minutes: number): string {
  const parts: string[] = [];
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
  return parts.join(' ');
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
          name: 'clear',
          description: 'Remove all bindings from a message.',
          parameters: [
            {
              name: 'message_id',
              description: 'The ID of the message to clear bindings from.',
              type: 'string',
              required: true,
            },
          ],
        },
        {
          name: 'list',
          description: 'List reaction role bindings — pass a message ID or page number.',
          parameters: [
            {
              name: 'query',
              description: 'Message ID or page number (e.g. 2).',
              type: 'string',
              required: false,
            },
            {
              name: 'page',
              description: 'Page number when filtering by message ID.',
              type: 'integer',
              required: false,
              minValue: 1,
            },
          ],
        },
      ],
    },
    {
      name: 'join',
      description: 'Manage join roles — roles assigned automatically when members join.',
      subcommands: [
        {
          name: 'add',
          description:
            'Add a role to be assigned when members join, with optional conditional delays.',
          parameters: [
            {
              name: 'role',
              description: 'The role to assign on member join.',
              type: 'role',
              required: true,
            },
            {
              name: 'member_age',
              description:
                'Minimum member age in minutes (e.g. 60 for 1 hour). Role assigned after this delay.',
              type: 'integer',
              required: false,
              minValue: 1,
            },
            {
              name: 'account_age',
              description:
                'Minimum account age in minutes (e.g. 1440 for 1 day). Role assigned after this delay.',
              type: 'integer',
              required: false,
              minValue: 1,
            },
          ],
        },
        {
          name: 'remove',
          description: 'Remove a join-role binding.',
          parameters: [
            {
              name: 'role',
              description: 'The role to unbind from join assignments.',
              type: 'role',
              required: true,
            },
          ],
        },
        {
          name: 'list',
          description: 'List all configured join roles for this server.',
        },
        {
          name: 'pending',
          description: 'Show pending delayed role assignments for this server.',
        },
      ],
    },
  ],
  async execute(message, args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('commands.role.guildOnly'));
      return;
    }

    // Check permissions
    if (message.channel?.userCanManageGuild) {
      const canManage = await message.channel.userCanManageGuild();
      if (!canManage) {
        await message.reply(t('commands.role.noPermission'));
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
        case 'clear':
          return handleReactionClear(message, args.slice(2));
        case 'list':
          return handleReactionList(message, args.slice(2));
        default:
          await showHelp(message);
      }
      return;
    }

    if (sub === 'join') {
      const action = args[1]?.toLowerCase();
      switch (action) {
        case 'add':
          return handleJoinAdd(message, args.slice(2));
        case 'remove':
          return handleJoinRemove(message, args.slice(2));
        case 'list':
          return handleJoinList(message);
        case 'pending':
          return handleJoinPending(message);
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
    title: t('commands.role.help.title'),
    color: 0x5865f2,
    description: [
      t('commands.role.help.reactionRoles'),
      '',
      t('commands.role.help.entry', {
        usage: '`!role reaction add <message-id> <emoji> <role>`',
        description: t('commands.role.reaction.add.description'),
      }),
      t('commands.role.help.entry', {
        usage: '`!role reaction remove <message-id> <emoji>`',
        description: t('commands.role.reaction.remove.description'),
      }),
      t('commands.role.help.entry', {
        usage: '`!role reaction clear <message-id>`',
        description: t('commands.role.reaction.clear.description'),
      }),
      t('commands.role.help.entry', {
        usage: '`!role reaction list [message-id|page]`',
        description: t('commands.role.reaction.list.description'),
      }),
      '',
      t('commands.role.help.joinRoles'),
      '',
      t('commands.role.help.entry', {
        usage: '`!role join add <role> [member_age] [account_age]`',
        description: t('commands.role.join.add.description'),
      }),
      t('commands.role.help.entry', {
        usage: '`!role join remove <role>`',
        description: t('commands.role.join.remove.description'),
      }),
      t('commands.role.help.entry', {
        usage: '`!role join list`',
        description: t('commands.role.join.list.description'),
      }),
      t('commands.role.help.entry', {
        usage: '`!role join pending`',
        description: t('commands.role.join.pending.description'),
      }),
    ].join('\n'),
  };
  await message.reply({ content: '', embeds: [embed] });
}

async function handleReactionAdd(message: any, args: string[]) {
  const guildId = message.guildId!;

  if (args.length < 3) {
    await message.reply(t('commands.role.reaction.add.usage'));
    return;
  }

  const messageId = args[0]!;
  let emoji = args[1]!;
  const roleInput = args[2]!;

  // Parse role ID from mention or raw ID
  const roleId = parseRoleId(roleInput);
  if (!roleId) {
    await message.reply(t('commands.role.reaction.add.invalidRole'));
    return;
  }

  // Normalise emoji to the platform's canonical format for storage
  // This also validates the emoji is usable in this guild
  if (message.channel?.resolveEmoji) {
    try {
      emoji = await message.channel.resolveEmoji(emoji);
    } catch {
      await message.reply(t('commands.role.reaction.add.invalidEmoji'));
      return;
    }
  }

  // Resolve channel ID for the message link and auto-react
  let channelId: string | null = null;
  if (message.channel?.fetchMessage) {
    const msg = await message.channel.fetchMessage(messageId);
    if (msg) channelId = msg.channelId;
  }

  const msgLabel = messageLink(message.platform, guildId, channelId, messageId);

  try {
    const binding = await reactionRoleService.addBinding({
      guildId,
      messageId,
      emoji,
      roleId,
      platform: message.platform as string,
    });

    // Auto-react to the target message (best-effort)
    if (message.channel?.reactToMessage && channelId) {
      await message.channel.reactToMessage(channelId, messageId, emoji);
    }

    await message.reply(
      t('commands.role.reaction.add.success', {
        emoji: displayEmoji(emoji),
        roleId,
        msg: msgLabel,
      })
    );
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    await message.reply(t('commands.role.reaction.add.error', { error: errMessage }));
  }
}

async function handleReactionRemove(message: any, args: string[]) {
  const guildId = message.guildId!;

  if (args.length < 2) {
    await message.reply(t('commands.role.reaction.remove.usage'));
    return;
  }

  const messageId = args[0]!;
  const emoji = args[1]!;

  let channelId: string | null = null;
  let resolved = emoji;
  if (message.channel?.fetchMessage) {
    const msg = await message.channel.fetchMessage(messageId);
    if (msg) channelId = msg.channelId;
  }
  if (message.channel?.resolveEmoji) {
    try {
      resolved = await message.channel.resolveEmoji(emoji);
    } catch {
      // Use raw input if resolution fails
    }
  }

  const removed = await reactionRoleService.removeBinding(guildId, messageId, resolved);

  if (!removed) {
    // Fallback: try the raw emoji too
    const fallbackRemoved = await reactionRoleService.removeBinding(guildId, messageId, emoji);
    if (!fallbackRemoved) {
      await message.reply(
        t('commands.role.reaction.remove.notFound', { emoji: displayEmoji(emoji) })
      );
      return;
    }
  }

  // Remove the bot's reaction from the message (best-effort)
  if (message.channel?.removeReactionFromMessage && channelId) {
    await message.channel.removeReactionFromMessage(channelId, messageId, resolved);
  }

  const msgLabel = messageLink(message.platform, guildId, channelId, messageId);

  await message.reply(
    t('commands.role.reaction.remove.success', { emoji: displayEmoji(emoji), msg: msgLabel })
  );
}

async function handleReactionClear(message: any, args: string[]) {
  const guildId = message.guildId!;

  if (args.length < 1) {
    await message.reply(t('commands.role.reaction.clear.usage'));
    return;
  }

  const messageId = args[0]!;

  let channelId: string | null = null;
  if (message.channel?.fetchMessage) {
    const msg = await message.channel.fetchMessage(messageId);
    if (msg) channelId = msg.channelId;
  }

  const bindings = await reactionRoleService.listBindings(guildId, messageId);

  if (bindings.length === 0) {
    await message.reply(t('commands.role.reaction.clear.notFound'));
    return;
  }

  // Remove the bot's reactions from the message
  if (message.channel?.removeReactionFromMessage && channelId) {
    for (const b of bindings) {
      try {
        await message.channel.removeReactionFromMessage(channelId, messageId, b.emoji);
      } catch {
        // Skip if the reaction isn't there
      }
    }
  }

  const count = await reactionRoleService.removeBindingsByMessage(guildId, messageId);

  const msgLabel = messageLink(message.platform, guildId, channelId, messageId);

  await message.reply(
    t('commands.role.reaction.clear.success', { count: String(count), msg: msgLabel })
  );
}

async function handleReactionList(message: any, args: string[]) {
  const guildId = message.guildId!;

  const PAGE_SIZE = 5;

  let messageId: string | undefined;
  let page = 1;

  const raw1 = args[0];
  const raw2 = args[1];

  if (raw1) {
    const isPage = /^\d{1,9}$/.test(raw1) && raw1.length < 17;
    const isMessageId = raw1.length >= 17 || !isPage;

    if (raw2 && /^\d{1,9}$/.test(raw2) && raw2.length < 17) {
      // Two args: message ID then page number
      messageId = raw1;
      page = Math.max(1, Number(raw2));
    } else if (isPage && !isMessageId) {
      // Single arg that's a page number
      page = Math.max(1, Number(raw1));
    } else {
      // Single arg that's a message ID
      messageId = raw1;
    }
  }

  const bindings = await reactionRoleService.listBindings(guildId, messageId);

  if (bindings.length === 0) {
    await message.reply(t('commands.role.reaction.list.empty'));
    return;
  }

  const totalPages = Math.ceil(bindings.length / PAGE_SIZE);
  page = Math.min(page, totalPages);

  const start = (page - 1) * PAGE_SIZE;
  const shown = Math.min(PAGE_SIZE, bindings.length - start);

  const lines: string[] = [];
  for (let i = start; i < start + shown; i++) {
    const b = bindings[i]!;

    // Best-effort fetch of message preview
    let preview: string | null = null;
    let channelId: string | null = null;
    if (message.channel?.fetchMessage) {
      const msg = await message.channel.fetchMessage(b.messageId);
      if (msg) {
        channelId = msg.channelId;
        if (msg.content) {
          preview = msg.content.slice(0, 50).replace(/\n/g, ' ');
          if (msg.content.length > 50) preview += '…';
        }
      }
    }

    const msgLabel = messageLink(message.platform, guildId, channelId, b.messageId);

    if (preview) {
      lines.push(
        t('commands.role.reaction.list.entryWithPreview', {
          index: i + 1,
          emoji: displayEmoji(b.emoji),
          roleId: b.roleId,
          msg: msgLabel,
          preview,
        })
      );
    } else {
      lines.push(
        t('commands.role.reaction.list.entry', {
          index: i + 1,
          emoji: displayEmoji(b.emoji),
          roleId: b.roleId,
          msg: msgLabel,
        })
      );
    }
  }

  const description = lines.join('\n').trimEnd();

  const embed: ReplyEmbed = {
    title: t('commands.role.reaction.list.title'),
    description,
    color: 0x5865f2,
  };

  if (totalPages > 1) {
    embed.footer = {
      text: t('commands.role.reaction.list.footer', {
        total: bindings.length,
        page,
        totalPages,
      }),
    };
  }

  await message.reply({ content: '', embeds: [embed] });
}

async function handleJoinAdd(message: any, args: string[]) {
  const guildId = message.guildId!;

  if (args.length < 1) {
    await message.reply(t('commands.role.join.add.usage'));
    return;
  }

  const roleInput = args[0]!;
  const roleId = parseRoleId(roleInput);
  if (!roleId) {
    await message.reply(t('commands.role.join.add.invalidRole'));
    return;
  }

  const memberAge = args[1] ? parseInt(args[1], 10) : undefined;
  const accountAge = args[2] ? parseInt(args[2], 10) : undefined;

  // Validate age values if provided.
  if (args[1] !== undefined && args[1] !== '' && (isNaN(memberAge!) || memberAge! < 0)) {
    await message.reply(t('commands.role.join.add.invalidAge'));
    return;
  }
  if (args[2] !== undefined && args[2] !== '' && (isNaN(accountAge!) || accountAge! < 0)) {
    await message.reply(t('commands.role.join.add.invalidAge'));
    return;
  }

  try {
    const binding = await joinRoleService.addBinding({
      guildId,
      roleId,
      platform: message.platform as string,
      minAccountAgeMinutes: accountAge && accountAge > 0 ? accountAge : null,
      minMemberAgeMinutes: memberAge && memberAge > 0 ? memberAge : null,
    });

    await message.reply(
      t('commands.role.join.add.success', {
        roleId,
        accountAge: binding.minAccountAgeMinutes
          ? formatDuration(binding.minAccountAgeMinutes)
          : t('commands.role.noCondition'),
        memberAge: binding.minMemberAgeMinutes
          ? formatDuration(binding.minMemberAgeMinutes)
          : t('commands.role.noCondition'),
      })
    );
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    await message.reply(t('commands.role.join.add.error', { error: errMessage }));
  }
}

async function handleJoinRemove(message: any, args: string[]) {
  const guildId = message.guildId!;

  if (args.length < 1) {
    await message.reply(t('commands.role.join.remove.usage'));
    return;
  }

  const roleInput = args[0]!;
  const roleId = parseRoleId(roleInput);
  if (!roleId) {
    await message.reply(t('commands.role.join.remove.invalidRole'));
    return;
  }

  const removed = await joinRoleService.removeBinding(guildId, roleId);

  if (!removed) {
    await message.reply(t('commands.role.join.remove.notFound', { roleId }));
    return;
  }

  await message.reply(t('commands.role.join.remove.success', { roleId }));
}

async function handleJoinList(message: any) {
  const guildId = message.guildId!;

  const bindings = await joinRoleService.listBindings(guildId);

  if (bindings.length === 0) {
    await message.reply(t('commands.role.join.list.empty'));
    return;
  }

  const lines: string[] = [];
  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i]!;
    const conditions: string[] = [];
    if (b.minAccountAgeMinutes) {
      conditions.push(
        t('commands.role.join.list.conditionAccountAge', {
          age: formatDuration(b.minAccountAgeMinutes),
        })
      );
    }
    if (b.minMemberAgeMinutes) {
      conditions.push(
        t('commands.role.join.list.conditionMemberAge', {
          age: formatDuration(b.minMemberAgeMinutes),
        })
      );
    }
    const conditionStr =
      conditions.length > 0 ? conditions.join(', ') : t('commands.role.join.list.immediate');

    lines.push(
      t('commands.role.join.list.entry', {
        index: i + 1,
        roleId: b.roleId,
        conditions: conditionStr,
      })
    );
  }

  const embed: ReplyEmbed = {
    title: t('commands.role.join.list.title'),
    description: lines.join('\n'),
    color: 0x5865f2,
    footer: {
      text: t('commands.role.join.list.footer', { count: bindings.length }),
    },
  };

  await message.reply({ content: '', embeds: [embed] });
}

async function handleJoinPending(message: any) {
  const guildId = message.guildId!;

  const pending = await joinRoleService.getPendingForGuild(guildId);

  if (pending.length === 0) {
    await message.reply(t('commands.role.join.pending.empty'));
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const lines: string[] = [];
  for (let i = 0; i < Math.min(pending.length, 20); i++) {
    const p = pending[i]!;
    const remaining = Math.max(0, p.dueAt - now);
    const formatted =
      remaining < 60 ? t('commands.role.join.pending.lessThanMinute') : `<t:${p.dueAt}:R>`;

    lines.push(
      t('commands.role.join.pending.entry', {
        index: i + 1,
        userId: p.userId,
        roleId: p.roleId,
        remaining: formatted,
      })
    );
  }

  const embed: ReplyEmbed = {
    title: t('commands.role.join.pending.title'),
    description: lines.join('\n'),
    color: 0xfee75c,
    footer: {
      text: t('commands.role.join.pending.footer', {
        count: pending.length,
        shown: Math.min(pending.length, 20),
      }),
    },
  };

  await message.reply({ content: '', embeds: [embed] });
}
