import pg from 'pg';
import type { TriggerStore, Trigger, TriggerUpdate, TaskRun } from './triggerStore.js';

const { Pool } = pg;

export interface PostgresTriggerStoreOptions {
  connectionString?: string;
  max?: number;
}

/**
 * PostgreSQL-backed trigger store.
 */
export class PostgresTriggerStore implements TriggerStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresTriggerStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });

    this.ensureTables();
  }

  async create(trigger: Omit<Trigger, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO guild_triggers
        (guild_id, cron, action, config, conditions, name, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        trigger.guildId,
        trigger.cron ?? null,
        trigger.action,
        JSON.stringify(trigger.config),
        JSON.stringify(trigger.conditions),
        trigger.name ?? null,
        trigger.enabled,
      ]
    );

    return result.rows[0].id as number;
  }

  async get(id: number): Promise<Trigger | null> {
    const result = await this.pool.query('SELECT * FROM guild_triggers WHERE id = $1', [id]);

    if (result.rows.length === 0) return null;
    return this.rowToTrigger(result.rows[0]);
  }

  async getByName(guildId: string, name: string): Promise<Trigger | null> {
    const result = await this.pool.query(
      'SELECT * FROM guild_triggers WHERE guild_id = $1 AND name = $2',
      [guildId, name]
    );

    if (result.rows.length === 0) return null;
    return this.rowToTrigger(result.rows[0]);
  }

  async getByGuild(guildId: string): Promise<Trigger[]> {
    const result = await this.pool.query(
      'SELECT * FROM guild_triggers WHERE guild_id = $1 ORDER BY created_at ASC',
      [guildId]
    );
    return result.rows.map((row) => this.rowToTrigger(row));
  }

  async update(id: number, updates: TriggerUpdate): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.cron !== undefined) {
      sets.push(`cron = $${paramIndex++}`);
      params.push(updates.cron);
    }
    if (updates.action !== undefined) {
      sets.push(`action = $${paramIndex++}`);
      params.push(updates.action);
    }
    if (updates.config !== undefined) {
      sets.push(`config = $${paramIndex++}`);
      params.push(JSON.stringify(updates.config));
    }
    if (updates.conditions !== undefined) {
      sets.push(`conditions = $${paramIndex++}`);
      params.push(JSON.stringify(updates.conditions));
    }
    if (updates.name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }
    if (updates.enabled !== undefined) {
      sets.push(`enabled = $${paramIndex++}`);
      params.push(updates.enabled);
    }

    if (sets.length === 0) return;

    sets.push(`updated_at = NOW()`);
    params.push(id);

    await this.pool.query(
      `UPDATE guild_triggers SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
      params
    );
  }

  async delete(id: number): Promise<void> {
    await this.pool.query('DELETE FROM guild_triggers WHERE id = $1', [id]);
  }

  async logRun(run: Omit<TaskRun, 'id'>): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO guild_task_runs
        (trigger_id, guild_id, started_at, finished_at, success, error_message, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        run.triggerId,
        run.guildId,
        run.startedAt,
        run.finishedAt ?? null,
        run.success,
        run.errorMessage ?? null,
        run.durationMs ?? null,
      ]
    );

    return result.rows[0].id as number;
  }

  async getRuns(triggerId: number, limit = 10): Promise<TaskRun[]> {
    const result = await this.pool.query(
      'SELECT * FROM guild_task_runs WHERE trigger_id = $1 ORDER BY started_at DESC LIMIT $2',
      [triggerId, limit]
    );

    return result.rows.map((row) => this.rowToTaskRun(row));
  }

  async pruneRuns(triggerId: number, keep: number): Promise<void> {
    await this.pool.query(
      `DELETE FROM guild_task_runs
       WHERE trigger_id = $1 AND id NOT IN (
         SELECT id FROM guild_task_runs
         WHERE trigger_id = $1
         ORDER BY started_at DESC
         LIMIT $2
       )`,
      [triggerId, keep]
    );
  }

  async getEnabledCronTriggers(): Promise<Trigger[]> {
    const result = await this.pool.query('SELECT * FROM guild_triggers WHERE enabled = true');

    return result.rows.map((row) => this.rowToTrigger(row));
  }

  async updateRunResult(id: number, lastRunAt: string, lastRunResult: string): Promise<void> {
    await this.pool.query(
      `UPDATE guild_triggers
       SET last_run_at = $1, last_run_result = $2, updated_at = NOW()
       WHERE id = $3`,
      [lastRunAt, lastRunResult, id]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private rowToTrigger(row: Record<string, unknown>): Trigger {
    return {
      id: row.id as number,
      guildId: row.guild_id as string,
      cron: (row.cron as string) ?? null,
      action: row.action as string,
      config:
        typeof row.config === 'string'
          ? JSON.parse(row.config as string)
          : (row.config as Record<string, unknown>),
      conditions:
        typeof row.conditions === 'string'
          ? JSON.parse(row.conditions as string)
          : (row.conditions as Record<string, unknown>),
      name: (row.name as string) ?? null,
      enabled: Boolean(row.enabled),
      lastRunAt: (row.last_run_at as string) ?? null,
      lastRunResult: (row.last_run_result as string) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private rowToTaskRun(row: Record<string, unknown>): TaskRun {
    return {
      id: row.id as number,
      triggerId: row.trigger_id as number,
      guildId: row.guild_id as string,
      startedAt: row.started_at as string,
      finishedAt: (row.finished_at as string) ?? null,
      success: row.success as number,
      errorMessage: (row.error_message as string) ?? null,
      durationMs: (row.duration_ms as number) ?? null,
    };
  }

  private async ensureTables(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS guild_triggers (
        id              SERIAL PRIMARY KEY,
        guild_id        TEXT NOT NULL,
        cron            TEXT,
        action          TEXT NOT NULL,
        config          JSONB NOT NULL DEFAULT '{}',
        conditions      JSONB NOT NULL DEFAULT '{}',
        name            TEXT,
        enabled         BOOLEAN NOT NULL DEFAULT true,
        last_run_at     TIMESTAMPTZ,
        last_run_result TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(guild_id, name)
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS guild_task_runs (
        id             SERIAL PRIMARY KEY,
        trigger_id     INTEGER NOT NULL REFERENCES guild_triggers(id) ON DELETE CASCADE,
        guild_id       TEXT NOT NULL,
        started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at    TIMESTAMPTZ,
        success        INTEGER NOT NULL DEFAULT 0,
        error_message  TEXT,
        duration_ms    INTEGER
      )
    `);

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_triggers_guild ON guild_triggers(guild_id)',

      'CREATE INDEX IF NOT EXISTS idx_task_runs_trigger ON guild_task_runs(trigger_id)',
      'CREATE INDEX IF NOT EXISTS idx_task_runs_guild ON guild_task_runs(guild_id)',
    ];

    for (const sql of indexes) {
      await this.pool.query(sql);
    }
  }
}
