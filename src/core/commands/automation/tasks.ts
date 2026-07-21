import { t } from '../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../types.js';
import { taskService } from '../../services/automation/taskService.js';
import { getActionConfigMeta } from '../../services/automation/actionRegistry.js';
import { parseCronExpression, cronToHuman } from '../../services/automation/cronParser.js';

export const TasksCommand: BotCommand = {
  name: 'task',
  description: 'Manage scheduled tasks for this server.',
  category: 'administration',
  requiredPermissions: ['ManageGuild'],

  parameters: [
    {
      name: 'subcommand',
      description:
        'list, show, create, rename, reschedule, retool, edit, pause, resume, delete, run, or history',
      type: 'string',
      required: true,
    },
  ],

  subcommands: [
    {
      name: 'list',
      description: 'Show all tasks with status, schedule, and action.',
    },
    {
      name: 'show',
      description: 'Show full details of a single task.',
      parameters: [{ name: 'name', description: 'Task name', type: 'string', required: true }],
    },
    {
      name: 'create',
      description:
        'Create a task. Provide name, when, action. Include all optional args to skip drafting.',
      parameters: [
        { name: 'name', description: 'Unique task name', type: 'string', required: true },
        {
          name: 'when',
          description: 'Schedule — plain English (daily, hourly, every 30m) or cron',
          type: 'string',
          required: false,
        },
        { name: 'action', description: 'Action to perform', type: 'string', required: false },
      ],
    },
    {
      name: 'rename',
      description: 'Change a task name.',
      parameters: [
        { name: 'old', description: 'Current task name', type: 'string', required: true },
        { name: 'new', description: 'New task name', type: 'string', required: true },
      ],
    },
    {
      name: 'reschedule',
      description: 'Change when a task runs. Use plain English.',
      parameters: [
        { name: 'name', description: 'Task name', type: 'string', required: true },
        {
          name: 'when',
          description: 'New schedule — daily, hourly, daily at 2pm, etc.',
          type: 'string',
          required: true,
        },
      ],
    },
    {
      name: 'retool',
      description: 'Swap a task to a different action type.',
      parameters: [
        { name: 'name', description: 'Task name', type: 'string', required: true },
        { name: 'action', description: 'New action type', type: 'string', required: true },
      ],
    },
    {
      name: 'edit',
      description: 'Change a task config value (message, count, role, etc.).',
      parameters: [
        { name: 'name', description: 'Task name', type: 'string', required: true },
        { name: 'key', description: 'Config key to set', type: 'string', required: true },
        {
          name: 'value',
          description: 'New value for the config key',
          type: 'string',
          required: true,
        },
      ],
    },
    {
      name: 'pause',
      description: 'Disable a task without deleting it.',
      parameters: [{ name: 'name', description: 'Task name', type: 'string', required: true }],
    },
    {
      name: 'resume',
      description: 'Enable a paused or draft task.',
      parameters: [{ name: 'name', description: 'Task name', type: 'string', required: true }],
    },
    {
      name: 'delete',
      description: 'Permanently delete a task.',
      parameters: [{ name: 'name', description: 'Task name', type: 'string', required: true }],
    },
    {
      name: 'run',
      description: 'Manually trigger a task now.',
      parameters: [{ name: 'name', description: 'Task name', type: 'string', required: true }],
    },
    {
      name: 'history',
      description: 'Show recent execution history for a task.',
      parameters: [{ name: 'name', description: 'Task name', type: 'string', required: true }],
    },
  ],

  async execute(message, args) {
    // Guild-only check
    if (!message.guildId) {
      await message.reply(t('commands.tasks.guildOnly'));
      return;
    }

    const subcommand = args[0]?.toLowerCase();

    if (!subcommand) {
      await showHelp(message);
      return;
    }

    switch (subcommand) {
      case 'list':
        await handleList(message);
        break;
      case 'show':
        await handleShow(message, args.slice(1));
        break;
      case 'create':
        await handleCreate(message, args.slice(1));
        break;
      case 'rename':
        await handleRename(message, args.slice(1));
        break;
      case 'reschedule':
        await handleReschedule(message, args.slice(1));
        break;
      case 'retool':
        await handleRetool(message, args.slice(1));
        break;
      case 'edit':
        await handleEdit(message, args.slice(1));
        break;
      case 'pause':
        await handlePause(message, args.slice(1));
        break;
      case 'resume':
        await handleResume(message, args.slice(1));
        break;
      case 'delete':
        await handleDelete(message, args.slice(1));
        break;
      case 'run':
        await handleRun(message, args.slice(1));
        break;
      case 'history':
        await handleHistory(message, args.slice(1));
        break;
      default:
        await message.reply(t('commands.tasks.unknownSubcommand', { sub: subcommand }));
    }
  },
};

async function showHelp(message: Parameters<BotCommand['execute']>[0]): Promise<void> {
  const actions = taskService.getAvailableActions();
  const actionsList = actions
    .map((a) => {
      const fields = getActionConfigMeta(a.name);
      if (!fields || fields.length === 0) {
        return `• \`${a.name}\` — ${a.description}`;
      }
      const keys = fields.map((f) => (f.required ? `\`${f.key}:?\`` : `\`[${f.key}]\``)).join(' ');
      return `• \`${a.name}\` — ${a.description}\n  ${keys}`;
    })
    .join('\n');

  const embed: ReplyEmbed = {
    title: t('commands.tasks.help.title'),
    color: 0x5865f2,
    description: [
      t('commands.tasks.help.descSchedule'),
      '',
      t('commands.tasks.help.subcommands'),
      t('commands.tasks.help.list'),
      t('commands.tasks.help.show'),
      t('commands.tasks.help.create'),
      t('commands.tasks.help.rename'),
      t('commands.tasks.help.reschedule'),
      t('commands.tasks.help.retool'),
      t('commands.tasks.help.edit'),
      t('commands.tasks.help.pause'),
      t('commands.tasks.help.resume'),
      t('commands.tasks.help.delete'),
      t('commands.tasks.help.run'),
      t('commands.tasks.help.history'),
      '',
      t('commands.tasks.help.whenTitle'),
      t('commands.tasks.help.whenExamples'),
      t('commands.tasks.help.whenAt'),
      t('commands.tasks.help.whenCron'),
      '',
      t('commands.tasks.help.availableActions'),
      actionsList,
      '',
      t('commands.tasks.help.tipsTitle'),
      t('commands.tasks.help.tipScheduled'),
      t('commands.tasks.help.tipManual'),
      t('commands.tasks.help.tipDraft'),
      t('commands.tasks.help.tipEdit'),
    ].join('\n'),
  };

  await message.reply({ content: '', embeds: [embed] });
}

async function handleList(message: Parameters<BotCommand['execute']>[0]): Promise<void> {
  if (!message.guildId) return;

  const tasks = await taskService.list(message.guildId);

  if (tasks.length === 0) {
    await message.reply(t('commands.tasks.list.empty'));
    return;
  }

  const lines = tasks.map((task, i) => {
    const missing = taskService.getMissingFields(task);
    const isManual = taskService.isManual(task);
    const isDraft = missing.length > 0;
    const status = isDraft ? '📝' : isManual ? '🖐️' : task.enabled ? '▶️' : '⏸️';
    const result =
      task.lastRunResult === 'success' ? '✅' : task.lastRunResult === 'failure' ? '❌' : '';
    const icons = result ? `${status} ${result}` : status;
    const lastRun = task.lastRunAt
      ? `${t('commands.tasks.list.lastRun')} <t:${Math.floor(new Date(task.lastRunAt).getTime() / 1000)}:R>`
      : t('commands.tasks.list.neverRun');
    const schedule = task.cron
      ? cronToHuman(task.cron)
      : isDraft
        ? ''
        : t('commands.tasks.list.manual');
    const schedulePrefix = schedule ? ` — ${schedule}` : '';
    const actionLabel = isDraft
      ? `${t('commands.tasks.list.need')} ${missing.join(', ')}`
      : `\`${task.action}\``;
    return `**${i + 1}.** **${task.name}**${schedulePrefix} → ${actionLabel} ${lastRun} ${icons}`;
  });

  const embed: ReplyEmbed = {
    title: t('commands.tasks.list.title'),
    color: 0x5865f2,
    description: lines.join('\n'),
    footer: { text: t('commands.tasks.list.footer', { count: tasks.length }) },
  };

  await message.reply({ content: '', embeds: [embed] });
}

async function handleShow(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply(t('commands.tasks.show.usage'));
    return;
  }

  try {
    const task = await taskService.get(message.guildId, args[0]!);
    if (!task) {
      await message.reply(t('commands.tasks.show.notFound', { name: args[0]! }));
      return;
    }

    const missing = taskService.getMissingFields(task);
    const isManual = taskService.isManual(task);
    const isDraft = missing.length > 0;
    const statusIcon = isDraft ? '📝' : isManual ? '🖐️' : task.enabled ? '▶️' : '⏸️';
    const statusLabel = isDraft
      ? t('commands.tasks.show.statusDraft')
      : isManual
        ? t('commands.tasks.show.statusManual')
        : task.enabled
          ? t('commands.tasks.show.statusActive')
          : t('commands.tasks.show.statusPaused');
    const schedule = task.cron ? `${cronToHuman(task.cron)} · \`${task.cron}\`` : null;
    const channelId = task.config?.channel as string | undefined;

    const infoLines: string[] = [
      `**${t('commands.tasks.show.labelStatus')}:** ${statusIcon} ${statusLabel}`,
    ];

    if (task.lastRunAt) {
      const ts = Math.floor(new Date(task.lastRunAt).getTime() / 1000);
      const icon =
        task.lastRunResult === 'success' ? '✅' : task.lastRunResult === 'failure' ? '❌' : '⏳';
      infoLines.push(`**${t('commands.tasks.show.labelLastRun')}:** ${icon} <t:${ts}:R>`);
    }

    infoLines.push(`**${t('commands.tasks.show.labelAction')}:** \`${task.action}\``);
    if (schedule) {
      infoLines.push(`**${t('commands.tasks.show.labelSchedule')}:** ${schedule}`);
    }

    const configLines: string[] = [];

    if (channelId) {
      configLines.push(`**${t('commands.tasks.show.labelChannel')}:** <#${channelId}>`);
    }

    for (const [key, value] of Object.entries(task.config ?? {})) {
      if (key === 'channel' || key === 'when') continue;
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      configLines.push(`**${label}:** \`${JSON.stringify(value)}\``);
    }

    const fields: { name: string; value: string; inline?: boolean }[] = [
      { name: t('commands.tasks.show.fieldDetails'), value: infoLines.join('\n') },
    ];

    if (configLines.length > 0) {
      fields.push({ name: t('commands.tasks.show.fieldConfig'), value: configLines.join('\n') });
    }

    // Show which config keys are available for this action
    const configFields = task.action ? getActionConfigMeta(task.action) : undefined;
    if (configFields && configFields.length > 0) {
      const lines: string[] = [];
      for (const field of configFields) {
        const badge = field.required
          ? t('commands.tasks.show.configRequired')
          : t('commands.tasks.show.configOptional');
        const defaultHint = field.default
          ? ` ${t('commands.tasks.show.configDefault', { default: field.default })}`
          : '';
        lines.push(`• \`${field.key}\` — ${badge}\n  ${field.description}${defaultHint}`);
      }
      if (lines.length > 0) {
        fields.push({
          name: t('commands.tasks.show.fieldAvailableConfig'),
          value: lines.join('\n'),
        });
      }
    }

    const embed: ReplyEmbed = {
      title: t('commands.tasks.show.title', { name: task.name ?? '' }),
      color: 0x5865f2,
      fields,
      footer: {
        text: t('commands.tasks.show.footer', {
          timestamp: Math.floor(new Date(task.createdAt).getTime() / 1000),
        }),
      },
    };

    if (isDraft) {
      embed.description = t('commands.tasks.show.missingDesc', { fields: missing.join(', ') });
    }

    await message.reply({ content: '', embeds: [embed] });
  } catch (error) {
    await message.reply(
      error instanceof Error
        ? t('commands.tasks.show.error', { message: error.message })
        : t('commands.tasks.show.errorGeneric')
    );
  }
}

async function handleCreate(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  // ── Draft mode: only a name provided ──────────────────────────────────
  if (args.length === 1) {
    const name = args[0]!;
    try {
      const task = await taskService.create(message.guildId, {
        name,
        action: '',
        channelId: '',
      });

      const embed: ReplyEmbed = {
        title: t('commands.tasks.create.draftTitle'),
        color: 0x5865f2,
        description: t('commands.tasks.create.draftDesc', { name: task.name ?? '' }),
      };

      await message.reply({ content: '', embeds: [embed] });
    } catch (error) {
      await message.reply(
        error instanceof Error
          ? t('commands.tasks.create.errorGeneric', { message: error.message })
          : t('commands.tasks.create.errorGeneric')
      );
    }
    return;
  }

  // ── One-shot mode: name + action + optional when + optional config ───
  if (args.length < 2) {
    await message.reply(t('commands.tasks.create.tooFewArgs'));
    return;
  }

  const name = args[0]!;
  const action = args[1]!.toLowerCase();

  // Validate action exists
  const available = taskService.getAvailableActions();
  const actionNames = new Set(available.map((a) => a.name));
  if (!actionNames.has(action)) {
    await message.reply(
      t('commands.tasks.create.unknownAction', { action, available: [...actionNames].join(', ') })
    );
    return;
  }

  // Everything after index 1 and before key:value pairs is the "when" expression
  // Key:value pairs start with a word containing ':'
  const restArgs = args.slice(2);
  const kvStart = restArgs.findIndex((a) => a.includes(':'));
  const whenWords = kvStart === -1 ? restArgs : restArgs.slice(0, kvStart);

  // If there's a when expression, try to parse it as cron
  let cronExpression: string | undefined;
  let rawWhen: string | undefined;
  if (whenWords.length > 0) {
    rawWhen = whenWords.join(' ');
    cronExpression = parseCronExpression(rawWhen);
  }

  // Parse key:value pairs from remaining args
  const kvPairs = kvStart === -1 ? [] : restArgs.slice(kvStart);
  const actionConfig: Record<string, unknown> = {};
  let channelId = '';

  for (const pair of kvPairs) {
    const colonIndex = pair.indexOf(':');
    if (colonIndex === -1) continue;

    const key = pair.slice(0, colonIndex).toLowerCase();
    const value = pair.slice(colonIndex + 1);

    switch (key) {
      case 'channel': {
        const match = value.match(/^<#(\d+)>$/);
        channelId = match ? match[1]! : value;
        break;
      }
      case 'message':
        actionConfig.message = value;
        break;
      case 'count':
        actionConfig.count = Number(value);
        break;
      case 'role': {
        const roleMatch = value.match(/^<@&(\d+)>$/);
        actionConfig.role = roleMatch ? roleMatch[1] : value;
        break;
      }
      case 'inactive_days':
        actionConfig.inactive_days = Number(value);
        break;
      default:
        actionConfig[key] = value;
        break;
    }
  }

  try {
    // Always create as draft first; we'll enable after if complete
    const task = await taskService.create(message.guildId, {
      name,
      cronExpression,
      rawWhen,
      action,
      channelId: channelId || '',
      ...(Object.keys(actionConfig).length > 0 ? { actionConfig } : {}),
      enabled: false,
    } as any);

    // Check what's still missing via the service (includes action-specific required config)
    const missing = taskService.getMissingFields(task);

    if (missing.length > 0) {
      const suffix = cronExpression
        ? t('commands.tasks.create.suffixResume', { name })
        : t('commands.tasks.create.suffixRun', { name });
      await message.reply(
        t('commands.tasks.create.draftResult', { name, fields: missing.join(', '), suffix })
      );
      return;
    }

    // All fields present — enable the task (different path for manual vs scheduled)
    if (cronExpression) {
      await taskService.resume(message.guildId, name);
    } else {
      await taskService.enableManual(message.guildId, name);
    }

    const isManual = taskService.isManual(task);
    const scheduleField = isManual
      ? {
          name: t('commands.tasks.create.fieldType'),
          value: t('commands.tasks.create.typeManual'),
          inline: true,
        }
      : {
          name: t('commands.tasks.create.fieldSchedule'),
          value: cronExpression ?? '(none)',
          inline: true,
        };

    const embed: ReplyEmbed = {
      title: t('commands.tasks.create.title'),
      color: 0x57f287,
      fields: [
        {
          name: t('commands.tasks.create.fieldName'),
          value: task.name ?? t('commands.tasks.create.unnamed'),
          inline: true,
        },
        { name: t('commands.tasks.create.fieldAction'), value: `\`${task.action}\``, inline: true },
        scheduleField,
      ],
    };

    await message.reply({ content: '', embeds: [embed] });
  } catch (error) {
    await message.reply(
      error instanceof Error
        ? t('commands.tasks.create.errorGeneric', { message: error.message })
        : t('commands.tasks.create.errorGeneric')
    );
  }
}

async function handleRename(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 2) {
    await message.reply(t('commands.tasks.rename.usage'));
    return;
  }

  try {
    const task = await taskService.rename(message.guildId, args[0]!, args[1]!);
    await message.reply(
      t('commands.tasks.rename.success', { oldName: args[0]!, newName: task.name ?? '' })
    );
  } catch (error) {
    await message.reply(
      error instanceof Error
        ? t('commands.tasks.rename.errorGeneric', { message: error.message })
        : t('commands.tasks.rename.errorGeneric')
    );
  }
}

async function handleReschedule(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 2) {
    await message.reply(t('commands.tasks.reschedule.usage'));
    return;
  }

  const name = args[0]!;
  const rawWhen = args.slice(1).join(' ');

  // Check for "none" or "manual" to clear the schedule
  if (rawWhen.toLowerCase() === 'none' || rawWhen.toLowerCase() === 'manual') {
    try {
      const task = await taskService.edit(message.guildId, name, {
        cronExpression: null,
      });
      await message.reply(t('commands.tasks.reschedule.cleared', { name: task.name ?? '' }));
    } catch (error) {
      await message.reply(
        error instanceof Error
          ? t('commands.tasks.reschedule.errorClear', { message: error.message })
          : t('commands.tasks.reschedule.errorClear')
      );
    }
    return;
  }

  try {
    const cronExpression = parseCronExpression(rawWhen);
    const task = await taskService.edit(message.guildId, name, {
      cronExpression,
      rawWhen,
    });

    const humanSchedule = cronToHuman(cronExpression);
    await message.reply(
      t('commands.tasks.reschedule.success', { name: task.name ?? '', schedule: humanSchedule })
    );
  } catch (error) {
    await message.reply(
      error instanceof Error
        ? t('commands.tasks.reschedule.errorGeneric', { message: error.message })
        : t('commands.tasks.reschedule.errorGeneric')
    );
  }
}

async function handleRetool(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 2) {
    await message.reply(t('commands.tasks.retool.usage'));
    return;
  }

  try {
    const task = await taskService.retool(message.guildId, args[0]!, args[1]!.toLowerCase());
    await message.reply(
      t('commands.tasks.retool.success', { name: task.name ?? '', action: task.action })
    );
  } catch (error) {
    await message.reply(
      error instanceof Error
        ? t('commands.tasks.retool.errorGeneric', { message: error.message })
        : t('commands.tasks.retool.errorGeneric')
    );
  }
}

async function handleEdit(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 2) {
    await message.reply(t('commands.tasks.edit.usage'));
    return;
  }

  const name = args[0]!;
  const rest = args.slice(1).join(' ');
  const colonIndex = rest.indexOf(':');

  if (colonIndex === -1) {
    await message.reply(t('commands.tasks.edit.formatError'));
    return;
  }

  const key = rest.slice(0, colonIndex).trim().toLowerCase();
  const value = rest.slice(colonIndex + 1).trim();

  const updates: {
    channelId?: string;
    actionConfig?: Record<string, unknown>;
    clearKeys?: string[];
  } = {};

  if (key === 'channel') {
    if (!value) {
      updates.clearKeys = ['channel'];
    } else {
      const match = value.match(/^<#(\d+)>$/);
      updates.channelId = match ? match[1]! : value;
    }
  } else {
    if (!value) {
      updates.clearKeys = [key];
    } else {
      updates.actionConfig = { [key]: value };
    }
  }

  try {
    await taskService.edit(message.guildId, name, updates);

    // Check if task is now complete
    const task = await taskService.get(message.guildId, name);
    const action = updates.clearKeys
      ? t('commands.tasks.edit.actionCleared')
      : t('commands.tasks.edit.actionChanged');
    let response = t('commands.tasks.edit.success', { name, key, action });
    if (task) {
      const missing = taskService.getMissingFields(task);
      if (missing.length === 0 && !task.enabled) {
        if (taskService.isManual(task)) {
          response += t('commands.tasks.edit.allFieldsManual', { name });
        } else if (task.action) {
          response += t('commands.tasks.edit.allFieldsScheduled', { name });
        }
      } else if (missing.length > 0) {
        response += t('commands.tasks.edit.stillMissing', { fields: missing.join(', ') });
      }
    }

    await message.reply(response);
  } catch (error) {
    await message.reply(
      error instanceof Error
        ? t('commands.tasks.edit.errorGeneric', { message: error.message })
        : t('commands.tasks.edit.errorGeneric')
    );
  }
}

async function handlePause(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply(t('commands.tasks.pause.usage'));
    return;
  }

  try {
    const wasRunning = await taskService.pause(message.guildId, args[0]!);
    const name = args[0]!;
    if (wasRunning) {
      await message.reply(t('commands.tasks.pause.success', { name }));
    } else {
      await message.reply(t('commands.tasks.pause.already', { name }));
    }
  } catch (error) {
    await message.reply(
      error instanceof Error
        ? t('commands.tasks.pause.errorGeneric', { message: error.message })
        : t('commands.tasks.pause.errorGeneric')
    );
  }
}

async function handleResume(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply(t('commands.tasks.resume.usage'));
    return;
  }

  try {
    const wasPaused = await taskService.resume(message.guildId, args[0]!);
    const name = args[0]!;
    if (wasPaused) {
      await message.reply(t('commands.tasks.resume.success', { name }));
    } else {
      await message.reply(t('commands.tasks.resume.already', { name }));
    }
  } catch (error) {
    await message.reply(
      error instanceof Error
        ? t('commands.tasks.resume.errorGeneric', { message: error.message })
        : t('commands.tasks.resume.errorGeneric')
    );
  }
}

async function handleDelete(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply(t('commands.tasks.delete.usage'));
    return;
  }

  try {
    await taskService.remove(message.guildId, args[0]!);
    await message.reply(t('commands.tasks.delete.success', { name: args[0]! }));
  } catch (error) {
    await message.reply(
      error instanceof Error
        ? t('commands.tasks.delete.errorGeneric', { message: error.message })
        : t('commands.tasks.delete.errorGeneric')
    );
  }
}

async function handleRun(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply(t('commands.tasks.run.usage'));
    return;
  }

  const name = args[0]!;

  // Defer reply since action execution may take time
  if (message.deferReply) await message.deferReply();

  try {
    const result = await taskService.run(message.guildId, name);
    await (message.followUp ? message.followUp(result) : message.reply(result));
  } catch (error) {
    const msg =
      error instanceof Error
        ? t('commands.tasks.run.errorGeneric', { message: error.message })
        : t('commands.tasks.run.errorGeneric');
    await (message.followUp ? message.followUp(msg) : message.reply(msg));
  }
}

async function handleHistory(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply(t('commands.tasks.history.usage'));
    return;
  }

  try {
    const n = args[0]!;
    const runs = await taskService.history(message.guildId, n);

    if (runs.length === 0) {
      await message.reply(t('commands.tasks.history.empty', { name: n }));
      return;
    }

    const lines = runs.map((run) => {
      const icon = run.success === 1 ? '✅' : run.success === -1 ? '❌' : '⏳';
      const duration = run.durationMs !== null ? ` (${run.durationMs}ms)` : '';
      const error = run.errorMessage ? ` — ${run.errorMessage}` : '';
      const timestamp = run.startedAt
        ? `<t:${Math.floor(new Date(run.startedAt).getTime() / 1000)}:R>`
        : t('commands.tasks.history.unknown');
      return `${icon} ${timestamp}${duration}${error}`;
    });

    const embed: ReplyEmbed = {
      title: t('commands.tasks.history.title', { name: n }),
      color: 0x5865f2,
      description: lines.join('\n'),
      footer: { text: t('commands.tasks.history.footer', { count: runs.length }) },
    };

    await message.reply({ content: '', embeds: [embed] });
  } catch (error) {
    await message.reply(
      error instanceof Error
        ? t('commands.tasks.history.errorGeneric', { message: error.message })
        : t('commands.tasks.history.errorGeneric')
    );
  }
}
