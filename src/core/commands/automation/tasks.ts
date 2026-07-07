import { t } from '../../i18n.js';
import type { BotCommand, ReplyEmbed } from '../../types.js';
import { taskService } from '../../services/automation/taskService.js';
import { getActionConfigMeta } from '../../services/automation/actionRegistry.js';
import { parseCronExpression, cronToHuman } from '../../services/automation/cronParser.js';

export const TasksCommand: BotCommand = {
  name: 'task',
  description: 'Manage scheduled tasks for this server.',
  category: 'automation',
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
      await message.reply('❌ This command can only be used in a server.');
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
        await message.reply(
          `❌ Unknown subcommand \`${subcommand}\`. Available: list, show, create, rename, reschedule, retool, edit, pause, resume, delete, run, history.`
        );
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
    title: '📋 Scheduled Tasks',
    color: 0x5865f2,
    description: [
      'Schedule automated actions for this server.',
      '',
      '**Subcommands:**',
      '`!task list` — Show all tasks',
      '`!task show <name>` — Show full task details',
      '`!task create <name> [action] [when]` — Create a task or draft',
      '`!task rename <old> <new>` — Rename a task',
      '`!task reschedule <name> <when>` — Change the schedule',
      '`!task retool <name> <action>` — Swap the action type',
      '`!task edit <name> <key>:<value>` — Change a config value',
      '`!task pause <name>` — Disable a task',
      '`!task resume <name>` — Enable a task',
      '`!task delete <name>` — Delete a task',
      '`!task run <name>` — Trigger a task now',
      '`!task history <name>` — Show recent runs',
      '',
      '**When — plain English or cron:**',
      '`daily` · `hourly` · `weekly` · `weekdays` · `every 30m`',
      '`every day at 9am` · `monday at 10am` · `midnight`',
      'Or raw cron like `0 9 * * 1` for power users.',
      '',
      '**Available actions:**',
      actionsList,
      '',
      '**Tips:**',
      '• `!task create greeting announce daily` creates an active task at once.',
      '• `!task create greeting` makes a draft — fill it with `edit`, then `resume`.',
      '• `!task edit greeting set message:Hello everyone` configures the action.',
    ].join('\n'),
  };

  await message.reply({ content: '', embeds: [embed] });
}

async function handleList(message: Parameters<BotCommand['execute']>[0]): Promise<void> {
  if (!message.guildId) return;

  const tasks = await taskService.list(message.guildId);

  if (tasks.length === 0) {
    await message.reply('📋 No tasks configured. Use `!task create` to add one.');
    return;
  }

  const lines = tasks.map((task, i) => {
    const missing = taskService.getMissingFields(task);
    const isDraft = missing.length > 0;
    const status = isDraft ? '📝' : task.enabled ? '▶️' : '⏸️';
    const result =
      task.lastRunResult === 'success' ? '✅' : task.lastRunResult === 'failure' ? '❌' : '';
    const icons = result ? `${status} ${result}` : status;
    const lastRun = task.lastRunAt
      ? `Last: <t:${Math.floor(new Date(task.lastRunAt).getTime() / 1000)}:R>`
      : 'Never run';
    const schedule = task.cron ? cronToHuman(task.cron) : '(draft)';
    const actionLabel = isDraft ? `Need: ${missing.join(', ')}` : `\`${task.action}\``;
    return `**${i + 1}.** **${task.name}** — ${schedule} → ${actionLabel} ${lastRun} ${icons}`;
  });

  const embed: ReplyEmbed = {
    title: '📋 Scheduled Tasks',
    color: 0x5865f2,
    description: lines.join('\n'),
    footer: { text: `Total: ${tasks.length} task(s) · 📝 draft · ▶️ active · ⏸️ paused` },
  };

  await message.reply({ content: '', embeds: [embed] });
}

async function handleShow(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply('❌ Usage: `!task show <name>`');
    return;
  }

  try {
    const task = await taskService.get(message.guildId, args[0]!);
    if (!task) {
      await message.reply(`❌ Task "${args[0]}" not found.`);
      return;
    }

    const missing = taskService.getMissingFields(task);
    const isDraft = missing.length > 0;
    const statusIcon = isDraft ? '📝' : task.enabled ? '▶️' : '⏸️';
    const statusLabel = isDraft ? 'Draft' : task.enabled ? 'Active' : 'Paused';
    const schedule = task.cron ? `${cronToHuman(task.cron)} · \`${task.cron}\`` : '(not set)';
    const channelId = task.config?.channel as string | undefined;

    const infoLines: string[] = [`**Status:** ${statusIcon} ${statusLabel}`];

    if (task.lastRunAt) {
      const ts = Math.floor(new Date(task.lastRunAt).getTime() / 1000);
      const icon =
        task.lastRunResult === 'success' ? '✅' : task.lastRunResult === 'failure' ? '❌' : '⏳';
      infoLines.push(`**Last Run:** ${icon} <t:${ts}:R>`);
    }

    infoLines.push(`**Action:** \`${task.action}\``, `**Schedule:** ${schedule}`);

    const configLines: string[] = [];

    if (channelId) {
      configLines.push(`**Channel:** <#${channelId}>`);
    }

    for (const [key, value] of Object.entries(task.config ?? {})) {
      if (key === 'channel' || key === 'when') continue;
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      configLines.push(`**${label}:** \`${JSON.stringify(value)}\``);
    }

    const fields: { name: string; value: string; inline?: boolean }[] = [
      { name: 'DETAILS', value: infoLines.join('\n') },
    ];

    if (configLines.length > 0) {
      fields.push({ name: 'CONFIGURATION', value: configLines.join('\n') });
    }

    // Show which config keys are available for this action
    const configFields = task.action ? getActionConfigMeta(task.action) : undefined;
    if (configFields && configFields.length > 0) {
      const lines: string[] = [];
      for (const field of configFields) {
        const badge = field.required ? '🔴 Required' : '🟢 Optional';
        const defaultHint = field.default ? ` (default: ${field.default})` : '';
        lines.push(`• \`${field.key}\` — ${badge}\n  ${field.description}${defaultHint}`);
      }
      if (lines.length > 0) {
        fields.push({ name: 'AVAILABLE CONFIG', value: lines.join('\n') });
      }
    }

    const embed: ReplyEmbed = {
      title: `📋 Task — ${task.name}`,
      color: 0x5865f2,
      fields,
      footer: { text: `Created <t:${Math.floor(new Date(task.createdAt).getTime() / 1000)}:R>` },
    };

    if (isDraft) {
      embed.description = `⚠️ Still missing: ${missing.join(', ')}`;
    }

    await message.reply({ content: '', embeds: [embed] });
  } catch (error) {
    await message.reply(`❌ ${error instanceof Error ? error.message : 'Failed to get task.'}`);
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
        cronExpression: '0 0 * * *', // placeholder, won't run since enabled=false
        action: '',
        channelId: '',
      });

      const embed: ReplyEmbed = {
        title: '📝 Draft Created',
        color: 0x5865f2,
        description:
          `Draft **${task.name}** saved. It needs a few things before it can run.\n\n` +
          'Fill them in:\n' +
          '`!task reschedule ' +
          name +
          ' <when>` — Set the schedule\n' +
          '`!task retool ' +
          name +
          ' <action>` — Choose what to do\n' +
          '`!task edit ' +
          name +
          ' set channel:#channel` — Set the target channel\n\n' +
          'When ready: `!task resume ' +
          name +
          '`',
      };

      await message.reply({ content: '', embeds: [embed] });
    } catch (error) {
      await message.reply(
        `❌ ${error instanceof Error ? error.message : 'Failed to create task.'}`
      );
    }
    return;
  }

  // ── One-shot mode: name + action + when + optional config ─────────────
  if (args.length < 3) {
    await message.reply(
      '❌ Too few arguments.\n' +
        '• One-shot: `!task create <name> <action> <when>`\n' +
        '• Draft: `!task create <name>` and fill the rest with `edit`.\n' +
        'Examples:\n' +
        '`!task create greeting announce daily channel:#general message:Hello!`\n' +
        '`!task create greeting`'
    );
    return;
  }

  const name = args[0]!;
  const action = args[1]!.toLowerCase();

  // Validate action exists
  const available = taskService.getAvailableActions();
  const actionNames = new Set(available.map((a) => a.name));
  if (!actionNames.has(action)) {
    await message.reply(
      '❌ Unknown action "' +
        action +
        '". Available: ' +
        [...actionNames].join(', ') +
        '\nUsage: `!task create <name> <action> <when>`'
    );
    return;
  }

  // Everything after index 1 and before key:value pairs is the "when" expression
  // Key:value pairs start with a word containing ':'
  const restArgs = args.slice(2);
  const kvStart = restArgs.findIndex((a) => a.includes(':'));
  const whenWords = kvStart === -1 ? restArgs : restArgs.slice(0, kvStart);

  if (whenWords.length === 0) {
    await message.reply('❌ Missing schedule. Usage: `!task create <name> <action> <when>`');
    return;
  }
  const rawWhen = whenWords.join(' ');
  const cronExpression = parseCronExpression(rawWhen);

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
      await message.reply(
        `📝 Created **${name}** as a draft — still missing: ${missing.join(', ')}.\n` +
          `Use \`!task edit ${name} set key:value\` to fill them in, then \`!task resume ${name}\` to activate.`
      );
      return;
    }

    // All fields present — enable the task
    await taskService.resume(message.guildId, name);

    const humanSchedule = cronToHuman(cronExpression);
    const scheduleDisplay =
      humanSchedule !== cronExpression ? `${humanSchedule}\n\`${task.cron}\`` : `\`${task.cron}\``;

    const embed: ReplyEmbed = {
      title: '✅ Task Created',
      color: 0x57f287,
      fields: [
        { name: 'Name', value: task.name ?? '(unnamed)', inline: true },
        { name: 'Action', value: `\`${task.action}\``, inline: true },
        { name: 'Schedule', value: scheduleDisplay, inline: true },
      ],
    };

    await message.reply({ content: '', embeds: [embed] });
  } catch (error) {
    await message.reply(`❌ ${error instanceof Error ? error.message : 'Failed to create task.'}`);
  }
}

async function handleRename(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 2) {
    await message.reply('❌ Usage: `!task rename <old-name> <new-name>`');
    return;
  }

  try {
    const task = await taskService.rename(message.guildId, args[0]!, args[1]!);
    await message.reply(`✅ Task renamed: **${args[0]}** → **${task.name}**`);
  } catch (error) {
    await message.reply(`❌ ${error instanceof Error ? error.message : 'Failed to rename task.'}`);
  }
}

async function handleReschedule(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 2) {
    await message.reply(
      '❌ Usage: `!task reschedule <name> <when>` — e.g. `!task reschedule greeting daily at 2pm`'
    );
    return;
  }

  const name = args[0]!;
  const rawWhen = args.slice(1).join(' ');

  try {
    const cronExpression = parseCronExpression(rawWhen);
    const task = await taskService.edit(message.guildId, name, {
      cronExpression,
      rawWhen,
    });

    const humanSchedule = cronToHuman(cronExpression);
    await message.reply(`✅ **${task.name}** rescheduled to **${humanSchedule}**.`);
  } catch (error) {
    await message.reply(
      `❌ ${error instanceof Error ? error.message : 'Failed to reschedule task.'}`
    );
  }
}

async function handleRetool(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 2) {
    await message.reply(
      '❌ Usage: `!task retool <name> <action>` — e.g. `!task retool greeting cleanup`'
    );
    return;
  }

  try {
    const task = await taskService.retool(message.guildId, args[0]!, args[1]!.toLowerCase());
    await message.reply(
      `✅ **${task.name}** retooled to \`${task.action}\`. Old action config has been cleared — use \`!task edit ${task.name} set <key>:<value>\` to configure the new action.`
    );
  } catch (error) {
    await message.reply(`❌ ${error instanceof Error ? error.message : 'Failed to retool task.'}`);
  }
}

async function handleEdit(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 2) {
    await message.reply(
      '❌ Usage: `!task edit <name> <key>:<value>` — e.g. `!task edit greeting message:Hello everyone`\n' +
        'Common keys: `channel`, `message`, `count`, `role`, `inactive_days`'
    );
    return;
  }

  const name = args[0]!;
  const rest = args.slice(1).join(' ');
  const colonIndex = rest.indexOf(':');

  if (colonIndex === -1) {
    await message.reply(
      '❌ Use `key:value` format — e.g. `!task edit greeting set message:Hello everyone`'
    );
    return;
  }

  const key = rest.slice(0, colonIndex).trim().toLowerCase();
  const value = rest.slice(colonIndex + 1).trim();

  const updates: {
    channelId?: string;
    actionConfig?: Record<string, unknown>;
  } = {};

  if (key === 'channel') {
    const match = value.match(/^<#(\d+)>$/);
    updates.channelId = match ? match[1]! : value;
  } else {
    updates.actionConfig = { [key]: value };
  }

  try {
    await taskService.edit(message.guildId, name, updates);

    // Check if task is now complete
    const task = await taskService.get(message.guildId, name);
    let response = `✅ **${name}** updated: \`${key}\` changed.`;
    if (task) {
      const missing = taskService.getMissingFields(task);
      if (missing.length === 0 && !task.enabled && task.cron && task.action) {
        response += ` All fields set! Use \`!task resume ${name}\` to activate.`;
      } else if (missing.length > 0) {
        response += ` Still missing: ${missing.join(', ')}.`;
      }
    }

    await message.reply(response);
  } catch (error) {
    await message.reply(`❌ ${error instanceof Error ? error.message : 'Failed to edit task.'}`);
  }
}

async function handlePause(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply('❌ Usage: `!task pause <name>`');
    return;
  }

  try {
    const wasRunning = await taskService.pause(message.guildId, args[0]!);
    if (wasRunning) {
      await message.reply(`⏸️ **${args[0]}** paused.`);
    } else {
      await message.reply(`⏸️ **${args[0]}** was already paused — no change.`);
    }
  } catch (error) {
    await message.reply(`❌ ${error instanceof Error ? error.message : 'Failed to pause task.'}`);
  }
}

async function handleResume(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply('❌ Usage: `!task resume <name>`');
    return;
  }

  try {
    const wasPaused = await taskService.resume(message.guildId, args[0]!);
    if (wasPaused) {
      await message.reply(`▶️ **${args[0]}** resumed.`);
    } else {
      await message.reply(`▶️ **${args[0]}** was already running — no change.`);
    }
  } catch (error) {
    await message.reply(`❌ ${error instanceof Error ? error.message : 'Failed to resume task.'}`);
  }
}

async function handleDelete(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply('❌ Usage: `!task delete <name>`');
    return;
  }

  try {
    await taskService.remove(message.guildId, args[0]!);
    await message.reply(`✅ Task **${args[0]}** deleted.`);
  } catch (error) {
    await message.reply(`❌ ${error instanceof Error ? error.message : 'Failed to delete task.'}`);
  }
}

async function handleRun(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply('❌ Usage: `!task run <name>`');
    return;
  }

  const name = args[0]!;

  // Defer reply since action execution may take time
  if (message.deferReply) await message.deferReply();

  try {
    const result = await taskService.run(message.guildId, name);
    await (message.followUp ? message.followUp(result) : message.reply(result));
  } catch (error) {
    const msg = `❌ ${error instanceof Error ? error.message : 'Failed to run task.'}`;
    await (message.followUp ? message.followUp(msg) : message.reply(msg));
  }
}

async function handleHistory(
  message: Parameters<BotCommand['execute']>[0],
  args: string[]
): Promise<void> {
  if (!message.guildId) return;

  if (args.length < 1) {
    await message.reply('❌ Usage: `!task history <name>`');
    return;
  }

  try {
    const n = args[0]!;
    const runs = await taskService.history(message.guildId, n);

    if (runs.length === 0) {
      await message.reply(`📋 No execution history for **${n}**.`);
      return;
    }

    const lines = runs.map((run) => {
      const icon = run.success === 1 ? '✅' : run.success === -1 ? '❌' : '⏳';
      const duration = run.durationMs !== null ? ` (${run.durationMs}ms)` : '';
      const error = run.errorMessage ? ` — ${run.errorMessage}` : '';
      const timestamp = run.startedAt
        ? `<t:${Math.floor(new Date(run.startedAt).getTime() / 1000)}:R>`
        : 'Unknown';
      return `${icon} ${timestamp}${duration}${error}`;
    });

    const embed: ReplyEmbed = {
      title: `📋 Execution History — ${n}`,
      color: 0x5865f2,
      description: lines.join('\n'),
      footer: { text: `Showing last ${runs.length} run(s)` },
    };

    await message.reply({ content: '', embeds: [embed] });
  } catch (error) {
    await message.reply(`❌ ${error instanceof Error ? error.message : 'Failed to get history.'}`);
  }
}
