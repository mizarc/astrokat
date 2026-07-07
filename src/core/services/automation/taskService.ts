import cron from 'node-cron';
import type { Trigger, TriggerStore, TaskRun } from './stores/triggerStore.js';
import { listActions, getAction } from './actionRegistry.js';
import { CronEngine } from './triggerEngineCron.js';

/**
 * Shape of the data needed to create a task.
 */
export interface TaskCreatePayload {
  name: string;
  cronExpression: string;
  action: string;
  channelId: string;
  /** Original human-readable "when" expression (e.g. "daily at 2pm"). */
  rawWhen?: string;
  /** Action-specific config (e.g. message text for announce). */
  actionConfig?: Record<string, unknown>;
  /** Whether the task should be active on creation (default true). */
  enabled?: boolean;
}

/**
 * TaskService: guild-scoped scheduled task management.
 *
 * This is the business logic layer that the !tasks command calls.
 * It validates inputs, delegates persistence to the TriggerStore,
 * and coordinates with the CronEngine for scheduling.
 */
export class TaskService {
  private readonly store: TriggerStore;
  private readonly cronEngine: CronEngine;

  constructor(store: TriggerStore, cronEngine: CronEngine) {
    this.store = store;
    this.cronEngine = cronEngine;
  }

  /** List all tasks (cron triggers) for a guild. */
  async list(guildId: string): Promise<Trigger[]> {
    return this.store.getByGuild(guildId, { managedBy: 'task' });
  }

  /** Get a single named task. */
  async get(guildId: string, name: string): Promise<Trigger | null> {
    return this.store.getByName(guildId, name);
  }

  /** List available actions (for help text / validation). */
  getAvailableActions(): { name: string; description: string }[] {
    return listActions();
  }

  /**
   * Check which required fields are missing for a task to be schedulable.
   * Returns an array of field names like ['when', 'action', 'channel'].
   */
  getMissingFields(task: Trigger): string[] {
    const missing: string[] = [];
    if (!task.cron) missing.push('schedule');
    if (!task.action) missing.push('action');
    if (!task.config?.channel) missing.push('channel');

    // Check action-specific required config
    if (task.action) {
      const action = getAction(task.action);
      if (action?.requiredConfig) {
        for (const key of action.requiredConfig) {
          if (!task.config?.[key]) missing.push(key);
        }
      }
    }

    return missing;
  }

  /** Rename a task. */
  async rename(guildId: string, oldName: string, newName: string): Promise<Trigger> {
    const trigger = await this.store.getByName(guildId, oldName);
    if (!trigger) throw new Error(`Task "${oldName}" not found.`);

    // Check new name isn't taken
    const existing = await this.store.getByName(guildId, newName);
    if (existing) throw new Error(`A task named "${newName}" already exists.`);

    await this.store.update(trigger.id, { name: newName } as any);
    const updated = await this.store.get(trigger.id);
    if (!updated) throw new Error('Failed to rename task.');

    await this.cronEngine.refresh();
    return updated;
  }

  /** Pause a task. */
  async pause(guildId: string, name: string): Promise<boolean> {
    const trigger = await this.store.getByName(guildId, name);
    if (!trigger) throw new Error(`Task "${name}" not found.`);

    if (!trigger.enabled) return false; // already paused

    await this.store.update(trigger.id, { enabled: false } as any);
    await this.cronEngine.refresh();
    return true;
  }

  /** Resume a task. */
  async resume(guildId: string, name: string): Promise<boolean> {
    const trigger = await this.store.getByName(guildId, name);
    if (!trigger) throw new Error(`Task "${name}" not found.`);

    // Check task is complete before resuming
    const missing = this.getMissingFields(trigger);
    if (missing.length > 0) {
      throw new Error(
        `Task "${name}" is incomplete. Still missing: ${missing.join(', ')}.\n` +
          `Fill them with \`!task edit ${name} set <key>:<value>\` then try again.`
      );
    }

    if (trigger.enabled) return false; // already running

    await this.store.update(trigger.id, { enabled: true } as any);
    await this.cronEngine.refresh();
    return true;
  }

  /** Retool a task. */
  async retool(guildId: string, name: string, newAction: string): Promise<Trigger> {
    const trigger = await this.store.getByName(guildId, name);
    if (!trigger) throw new Error(`Task "${name}" not found.`);

    const available = this.getAvailableActions();
    if (!available.find((a) => a.name === newAction)) {
      throw new Error(
        `Unknown action "${newAction}". Available: ${available.map((a) => a.name).join(', ')}.`
      );
    }

    // Keep channel, replace everything else in config
    const channel = trigger.config?.channel;
    await this.store.update(trigger.id, {
      action: newAction,
      config: channel ? { channel } : {},
    } as any);

    const updated = await this.store.get(trigger.id);
    if (!updated) throw new Error('Failed to retool task.');

    await this.cronEngine.refresh();
    return updated;
  }

  /** Create a new scheduled task. */
  async create(guildId: string, payload: TaskCreatePayload): Promise<Trigger> {
    const now = new Date().toISOString();
    // Validate cron expression
    if (!cron.validate(payload.cronExpression)) {
      throw new Error(`Invalid cron expression: "${payload.cronExpression}".`);
    }

    // Validate action exists
    const available = this.getAvailableActions();
    if (!available.find((a) => a.name === payload.action)) {
      throw new Error(
        `Unknown action "${payload.action}". Available: ${available.map((a) => a.name).join(', ')}.`
      );
    }

    // Check name uniqueness
    const existing = await this.store.getByName(guildId, payload.name);
    if (existing) {
      throw new Error(`A task named "${payload.name}" already exists.`);
    }

    const config: Record<string, unknown> = {
      channel: payload.channelId,
      ...(payload.rawWhen ? { when: payload.rawWhen } : {}),
      ...(payload.actionConfig ?? {}),
    };

    const id = await this.store.create({
      guildId,
      event: 'cron',
      cron: payload.cronExpression,
      action: payload.action,
      config,
      conditions: {},
      name: payload.name,
      enabled: payload.enabled ?? true,
      managedBy: 'task',
      groupId: null,
      lastRunAt: null,
      lastRunResult: null,
    });

    const created = await this.store.get(id);
    if (!created) throw new Error('Failed to create task.');

    await this.cronEngine.refresh();
    return created;
  }

  /** Edit a field of an existing task. */
  async edit(
    guildId: string,
    name: string,
    updates: {
      cronExpression?: string;
      rawWhen?: string;
      action?: string;
      channelId?: string;
      actionConfig?: Record<string, unknown>;
    }
  ): Promise<Trigger> {
    const trigger = await this.store.getByName(guildId, name);
    if (!trigger) throw new Error(`Task "${name}" not found.`);

    const storeUpdates: Record<string, unknown> = {};

    if (updates.cronExpression !== undefined) {
      if (!cron.validate(updates.cronExpression)) {
        throw new Error(`Invalid cron expression: "${updates.cronExpression}".`);
      }
      storeUpdates.cron = updates.cronExpression;
      // Also update the human-readable "when" in config
      if (updates.rawWhen) {
        storeUpdates.config = {
          ...trigger.config,
          when: updates.rawWhen,
        };
      }
    }

    if (updates.action !== undefined) {
      const available = this.getAvailableActions();
      if (!available.find((a) => a.name === updates.action)) {
        throw new Error(
          `Unknown action "${updates.action}". Available: ${available.map((a) => a.name).join(', ')}.`
        );
      }
      storeUpdates.action = updates.action;
    }

    if (updates.channelId !== undefined) {
      storeUpdates.config = {
        ...trigger.config,
        channel: updates.channelId,
        ...(updates.actionConfig ?? {}),
      };
    } else if (updates.actionConfig !== undefined) {
      storeUpdates.config = {
        ...trigger.config,
        ...updates.actionConfig,
      };
    }

    await this.store.update(trigger.id, storeUpdates as any);

    const updated = await this.store.get(trigger.id);
    if (!updated) throw new Error('Failed to update task.');

    await this.cronEngine.refresh();
    return updated;
  }

  /** Toggle a task's enabled state. Returns the new state. */
  async toggle(guildId: string, name: string): Promise<boolean> {
    const trigger = await this.store.getByName(guildId, name);
    if (!trigger) throw new Error(`Task "${name}" not found.`);

    const newState = !trigger.enabled;
    await this.store.update(trigger.id, { enabled: newState });
    await this.cronEngine.refresh();
    return newState;
  }

  /** Delete a task. */
  async remove(guildId: string, name: string): Promise<void> {
    const trigger = await this.store.getByName(guildId, name);
    if (!trigger) throw new Error(`Task "${name}" not found.`);

    await this.store.delete(trigger.id);
    await this.cronEngine.refresh();
  }

  /** Manually fire a task. Returns a result message. */
  async run(guildId: string, name: string): Promise<string> {
    const trigger = await this.store.getByName(guildId, name);
    if (!trigger) throw new Error(`Task "${name}" not found.`);

    return this.cronEngine.fireTrigger(trigger);
  }

  /** Get execution history for a task. */
  async history(guildId: string, name: string, limit = 10): Promise<TaskRun[]> {
    const trigger = await this.store.getByName(guildId, name);
    if (!trigger) throw new Error(`Task "${name}" not found.`);

    return this.store.getRuns(trigger.id, limit);
  }
}

/**
 * Default singleton, picking the backend based on environment.
 */
import { t } from '../../i18n.js';
import { SqliteTriggerStore } from './stores/triggerStoreSqlite.js';
import { PostgresTriggerStore } from './stores/triggerStorePostgres.js';

const triggerStore: TriggerStore = process.env.DATABASE_URL
  ? new PostgresTriggerStore()
  : new SqliteTriggerStore();

console.log(t('tasks.backend', { backend: process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite' }));

export const cronEngine = new CronEngine(triggerStore);
export const taskService = new TaskService(triggerStore, cronEngine);
