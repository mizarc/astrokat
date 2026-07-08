export interface Trigger {
  id: number;
  guildId: string;
  cron: string | null;
  action: string;
  config: Record<string, unknown>;
  conditions: Record<string, unknown>;
  name: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunResult: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A single execution record for a trigger (used by !tasks history). */
export interface TaskRun {
  id: number;
  triggerId: number;
  guildId: string;
  startedAt: string;
  finishedAt: string | null;
  success: number; // 0 = pending, 1 = success, -1 = failure
  errorMessage: string | null;
  durationMs: number | null;
}

export type TriggerUpdate = Partial<
  Pick<Trigger, 'cron' | 'action' | 'config' | 'conditions' | 'name' | 'enabled'>
>;

/**
 * Abstract storage interface for guild triggers and task run history.
 */
export interface TriggerStore {
  /** Create a new trigger. Returns the new trigger's ID. */
  create(trigger: Omit<Trigger, 'id' | 'createdAt' | 'updatedAt'>): Promise<number>;

  /** Get a single trigger by its primary key. */
  get(id: number): Promise<Trigger | null>;

  /** Get a named trigger within a guild. Names are unique per guild when not null. */
  getByName(guildId: string, name: string): Promise<Trigger | null>;

  /** Get all triggers for a guild. */
  getByGuild(guildId: string): Promise<Trigger[]>;

  /** Partial update of a trigger. */
  update(id: number, updates: TriggerUpdate): Promise<void>;

  /** Delete a trigger by its primary key. */
  delete(id: number): Promise<void>;

  /** Log a new task run. Returns the run's ID. */
  logRun(run: Omit<TaskRun, 'id'>): Promise<number>;

  /** Get the most recent runs for a trigger, newest first. */
  getRuns(triggerId: number, limit?: number): Promise<TaskRun[]>;

  /** Remove runs older than the given count (keep newest N). */
  pruneRuns(triggerId: number, keep: number): Promise<void>;

  /** Get all enabled cron triggers across all guilds. */
  getEnabledCronTriggers(): Promise<Trigger[]>;

  /** Update last_run_at + last_run_result after execution. */
  updateRunResult(id: number, lastRunAt: string, lastRunResult: string): Promise<void>;
}
