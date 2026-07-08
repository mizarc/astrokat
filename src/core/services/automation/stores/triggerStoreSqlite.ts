import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { TriggerStore, Trigger, TriggerUpdate, TaskRun } from './triggerStore.js';

export interface SqliteTriggerStoreOptions {
  dbPath?: string;
}

/**
 * SQLite-backed trigger store.
 *
 */
export class SqliteTriggerStore implements TriggerStore {
  private readonly db: Database.Database;

  constructor(options?: SqliteTriggerStoreOptions) {
    const dbPath = options?.dbPath ?? resolve('data', 'astrokat.db');
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureTables();
  }

  async create(trigger: Omit<Trigger, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO guild_triggers
        (guild_id, cron, action, config, conditions, name, enabled)
      VALUES
        (@guildId, @cron, @action, @config, @conditions, @name, @enabled)
    `);

    const result = stmt.run({
      guildId: trigger.guildId,
      cron: trigger.cron ?? null,
      action: trigger.action,
      config: JSON.stringify(trigger.config),
      conditions: JSON.stringify(trigger.conditions),
      name: trigger.name ?? null,
      enabled: trigger.enabled ? 1 : 0,
    });

    return Number(result.lastInsertRowid);
  }

  async get(id: number): Promise<Trigger | null> {
    const row = this.db.prepare('SELECT * FROM guild_triggers WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;

    if (!row) return null;
    return this.rowToTrigger(row);
  }

  async getByName(guildId: string, name: string): Promise<Trigger | null> {
    const row = this.db
      .prepare('SELECT * FROM guild_triggers WHERE guild_id = ? AND name = ?')
      .get(guildId, name) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToTrigger(row);
  }

  async getByGuild(guildId: string): Promise<Trigger[]> {
    const rows = this.db
      .prepare('SELECT * FROM guild_triggers WHERE guild_id = ? ORDER BY created_at ASC')
      .all(guildId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToTrigger(row));
  }

  async update(id: number, updates: TriggerUpdate): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.cron !== undefined) {
      sets.push('cron = ?');
      params.push(updates.cron);
    }
    if (updates.action !== undefined) {
      sets.push('action = ?');
      params.push(updates.action);
    }
    if (updates.config !== undefined) {
      sets.push('config = ?');
      params.push(JSON.stringify(updates.config));
    }
    if (updates.conditions !== undefined) {
      sets.push('conditions = ?');
      params.push(JSON.stringify(updates.conditions));
    }
    if (updates.name !== undefined) {
      sets.push('name = ?');
      params.push(updates.name);
    }
    if (updates.enabled !== undefined) {
      sets.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = datetime('now')");
    params.push(id);

    this.db.prepare(`UPDATE guild_triggers SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  async delete(id: number): Promise<void> {
    this.db.prepare('DELETE FROM guild_triggers WHERE id = ?').run(id);
  }

  async logRun(run: Omit<TaskRun, 'id'>): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO guild_task_runs
        (trigger_id, guild_id, started_at, finished_at, success, error_message, duration_ms)
      VALUES
        (@triggerId, @guildId, @startedAt, @finishedAt, @success, @errorMessage, @durationMs)
    `);

    const result = stmt.run({
      triggerId: run.triggerId,
      guildId: run.guildId,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? null,
      success: run.success,
      errorMessage: run.errorMessage ?? null,
      durationMs: run.durationMs ?? null,
    });

    return Number(result.lastInsertRowid);
  }

  async getRuns(triggerId: number, limit = 10): Promise<TaskRun[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM guild_task_runs WHERE trigger_id = ? ORDER BY started_at DESC LIMIT ?'
      )
      .all(triggerId, limit) as Record<string, unknown>[];

    return rows.map((row) => this.rowToTaskRun(row));
  }

  async pruneRuns(triggerId: number, keep: number): Promise<void> {
    this.db
      .prepare(
        `
      DELETE FROM guild_task_runs
      WHERE trigger_id = ? AND id NOT IN (
        SELECT id FROM guild_task_runs
        WHERE trigger_id = ?
        ORDER BY started_at DESC
        LIMIT ?
      )
    `
      )
      .run(triggerId, triggerId, keep);
  }

  async getEnabledCronTriggers(): Promise<Trigger[]> {
    const rows = this.db.prepare('SELECT * FROM guild_triggers WHERE enabled = 1').all() as Record<
      string,
      unknown
    >[];

    return rows.map((row) => this.rowToTrigger(row));
  }

  async updateRunResult(id: number, lastRunAt: string, lastRunResult: string): Promise<void> {
    this.db
      .prepare(
        `
      UPDATE guild_triggers
      SET last_run_at = ?, last_run_result = ?, updated_at = datetime('now')
      WHERE id = ?
    `
      )
      .run(lastRunAt, lastRunResult, id);
  }

  private rowToTrigger(row: Record<string, unknown>): Trigger {
    return {
      id: row.id as number,
      guildId: row.guild_id as string,
      cron: (row.cron as string) ?? null,
      action: row.action as string,
      config: JSON.parse(row.config as string) as Record<string, unknown>,
      conditions: JSON.parse(row.conditions as string) as Record<string, unknown>,
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

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_triggers (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id         TEXT NOT NULL,
        cron             TEXT,
        action           TEXT NOT NULL,
        config           TEXT NOT NULL DEFAULT '{}',
        conditions       TEXT NOT NULL DEFAULT '{}',
        name             TEXT,
        enabled          INTEGER NOT NULL DEFAULT 1,
        last_run_at      TEXT,
        last_run_result  TEXT,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(guild_id, name)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_task_runs (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_id     INTEGER NOT NULL REFERENCES guild_triggers(id) ON DELETE CASCADE,
        guild_id       TEXT NOT NULL,
        started_at     TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at    TEXT,
        success        INTEGER NOT NULL DEFAULT 0,
        error_message  TEXT,
        duration_ms    INTEGER
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_triggers_guild ON guild_triggers(guild_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_runs_trigger ON guild_task_runs(trigger_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_runs_guild ON guild_task_runs(guild_id)
    `);

    // Enable foreign key enforcement
    this.db.pragma('foreign_keys = ON');
  }
}
