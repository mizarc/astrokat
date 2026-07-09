import cron from 'node-cron';
import { t } from '../../i18n.js';
import type { Trigger, TriggerStore } from './stores/triggerStore.js';
import { getAction } from './actionRegistry.js';
import type { ActionContext } from './actionTypes.js';
import type { ActionDispatcher } from '../../types.js';

/**
 * Cron-based trigger engine.
 *
 * On start(), loads all enabled cron triggers from the store,
 * groups them by cron expression, and schedules one node-cron job
 * per unique expression. When a cron fires, it iterates all triggers
 * with that expression and dispatches their configured action.
 */
export class CronEngine {
  private readonly store: TriggerStore;
  private scheduledJobs: Map<string, any> = new Map();
  private running = false;
  private discordClient: ActionContext['discordClient'] | null = null;
  private fluxerClient: ActionContext['fluxerClient'] | null = null;
  private discordDispatcher: ActionDispatcher | null = null;
  private fluxerDispatcher: ActionDispatcher | null = null;

  constructor(store: TriggerStore) {
    this.store = store;
  }

  /**
   * Set the Discord client reference.
   * Injected into action context for actions that need platform access.
   * Must be called before start().
   */
  setDiscordClient(client: NonNullable<ActionContext['discordClient']>): void {
    this.discordClient = client;
  }

  /**
   * Set the Fluxer client reference.
   * Injected into action context for actions that need platform access.
   * Must be called before start().
   */
  setFluxerClient(client: NonNullable<ActionContext['fluxerClient']>): void {
    this.fluxerClient = client;
  }

  /**
   * Set the Discord action dispatcher.
   * Handles channel resolution and message sending for the Discord platform.
   * Must be called before start().
   */
  setDiscordDispatcher(dispatcher: ActionDispatcher): void {
    this.discordDispatcher = dispatcher;
  }

  /**
   * Set the Fluxer action dispatcher.
   * Handles channel resolution and message sending for the Fluxer platform.
   * Must be called before start().
   */
  setFluxerDispatcher(dispatcher: ActionDispatcher): void {
    this.fluxerDispatcher = dispatcher;
  }

  /**
   * Start the cron engine. Loads all enabled cron triggers and schedules them.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const triggers = await this.store.getEnabledCronTriggers();
    if (triggers.length === 0) {
      console.log(t('tasks.cronNoTriggers'));
      return;
    }

    // Group triggers by cron expression so we can share one timer per unique expression
    const grouped = new Map<string, Trigger[]>();
    for (const trigger of triggers) {
      if (!trigger.cron) continue;
      const existing = grouped.get(trigger.cron) ?? [];
      existing.push(trigger);
      grouped.set(trigger.cron, existing);
    }

    let scheduledCount = 0;
    for (const [expression, group] of grouped) {
      if (!cron.validate(expression)) {
        console.log(t('tasks.cronInvalidExpression', { expr: expression, count: group.length }));
        continue;
      }

      const task = cron.schedule(expression, async () => {
        await this.fireGroup(group);
      });

      this.scheduledJobs.set(expression, task);
      scheduledCount += group.length;
    }

    console.log(
      t('tasks.cronScheduled', { count: scheduledCount, unique: this.scheduledJobs.size })
    );
  }

  /**
   * Stop all scheduled cron jobs.
   */
  stop(): void {
    for (const [, task] of this.scheduledJobs) {
      task.stop();
    }
    this.scheduledJobs.clear();
    this.running = false;
    console.log(t('tasks.cronStopped'));
  }

  /**
   * Refresh all scheduled jobs from the store.
   * Call this after any task mutation (create, edit, pause, resume, delete)
   * to keep the engine in sync with the database.
   */
  async refresh(): Promise<void> {
    const wasRunning = this.running;
    this.stop();
    if (wasRunning) {
      await this.start();
    }
  }

  /**
   * Manually fire a single trigger (used by !tasks run).
   * Returns the action result message.
   */
  async fireTrigger(trigger: Trigger): Promise<string> {
    return this.executeAction(trigger);
  }

  /**
   * Execute a trigger's action with its configuration.
   */
  private async executeAction(trigger: Trigger): Promise<string> {
    const action = getAction(trigger.action);
    if (!action) {
      await this.recordRun(trigger, false, `Unknown action: ${trigger.action}`);
      return `❌ Triggered \`${trigger.name ?? trigger.id}\` › **${trigger.action}**: Unknown action.`;
    }

    // Determine the target channel from config
    const channelId = trigger.config.channel as string | undefined;
    if (!channelId) {
      await this.recordRun(trigger, false, 'No channel configured.');
      return `❌ Triggered \`${trigger.name ?? trigger.id}\` › **${trigger.action}**: No target channel configured.`;
    }

    // Resolve the channel. Try Discord first, then Fluxer
    const guildId = trigger.guildId;
    let channel: any = null;
    let platform: 'discord' | 'fluxer' = 'discord';
    let resolvedDispatcher: ActionDispatcher | null = null;

    if (this.discordDispatcher) {
      channel = await this.discordDispatcher.resolveChannel(guildId, channelId);
      if (channel) {
        platform = 'discord';
        resolvedDispatcher = this.discordDispatcher;
      }
    }

    if (!channel && this.fluxerDispatcher) {
      channel = await this.fluxerDispatcher.resolveChannel(guildId, channelId);
      if (channel) {
        platform = 'fluxer';
        resolvedDispatcher = this.fluxerDispatcher;
      }
    }

    if (!channel) {
      await this.recordRun(trigger, false, `Channel ${channelId} not found on any platform.`);
      return `❌ Triggered \`${trigger.name ?? trigger.id}\` › **${trigger.action}**: Channel <#${channelId}> not found.`;
    }

    // Build a platform-agnostic send helper via the resolved dispatcher
    const sendToChannel: (
      payload: string | { content?: string; embeds?: any[] }
    ) => Promise<any> = async (payload) => {
      return resolvedDispatcher!.sendToChannel(guildId, channelId, payload);
    };

    const context: ActionContext = {
      guildId,
      channelId,
      config: trigger.config,
      platform,
      channel,
      sendToChannel,
      discordClient: this.discordClient ?? undefined,
      fluxerClient: this.fluxerClient ?? undefined,
    } as ActionContext;

    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    try {
      const result = await action.execute(context);
      const durationMs = Date.now() - startMs;

      await this.store.logRun({
        triggerId: trigger.id,
        guildId: trigger.guildId,
        startedAt,
        finishedAt: new Date().toISOString(),
        success: result.success ? 1 : -1,
        errorMessage: result.error ?? null,
        durationMs,
      });

      await this.store.updateRunResult(
        trigger.id,
        startedAt,
        result.success ? 'success' : 'failure'
      );

      // Keep only the last 20 runs
      await this.store.pruneRuns(trigger.id, 20);

      return result.success
        ? `✅ Triggered \`${trigger.name ?? trigger.id}\` › **${trigger.action}**: ${result.message ?? 'Task executed.'}`
        : `❌ Triggered \`${trigger.name ?? trigger.id}\` › **${trigger.action}**: ${result.error ?? 'Task failed.'}`;
    } catch (error) {
      const durationMs = Date.now() - startMs;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      await this.store.logRun({
        triggerId: trigger.id,
        guildId: trigger.guildId,
        startedAt,
        finishedAt: new Date().toISOString(),
        success: -1,
        errorMessage: errorMsg,
        durationMs,
      });

      await this.store.updateRunResult(trigger.id, startedAt, 'failure');
      await this.store.pruneRuns(trigger.id, 20);

      return `❌ Triggered \`${trigger.name ?? trigger.id}\` › **${trigger.action}**: ${errorMsg}`;
    }
  }

  /**
   * Fire all triggers in a group (same cron expression).
   */
  private async fireGroup(triggers: Trigger[]): Promise<void> {
    for (const trigger of triggers) {
      if (!trigger.enabled) {
        console.log(`Skipping disabled trigger: ${trigger.id}`);
        continue;
      }
      await this.executeAction(trigger);
    }
  }

  /**
   * Record a quick run entry for early-exit failures.
   */
  private async recordRun(
    trigger: Trigger,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.store.logRun({
      triggerId: trigger.id,
      guildId: trigger.guildId,
      startedAt: now,
      finishedAt: now,
      success: success ? 1 : -1,
      errorMessage: errorMessage ?? null,
      durationMs: 0,
    });

    await this.store.updateRunResult(trigger.id, now, success ? 'success' : 'failure');
    await this.store.pruneRuns(trigger.id, 20);
  }
}
