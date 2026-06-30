import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { GuildSnapshotStore, GuildSnapshot } from './guildSnapshotStore.js';

export interface SqliteGuildSnapshotStoreOptions {
  /** Path to the SQLite database file. Defaults to `data/astrokat.db`. */
  dbPath?: string;
}

/**
 * SQLite-backed guild snapshot store.
 *
 * Embedded, ACID-compliant, zero setup. Suitable for single-instance
 * deployments (the common case for self-hosted bots).
 *
 * For multi-instance / clustered deployments, swap to a
 * `PostgresGuildSnapshotStore` (shares the same interface).
 */
export class SqliteGuildSnapshotStore implements GuildSnapshotStore {
  private readonly db: Database.Database;

  constructor(options?: SqliteGuildSnapshotStoreOptions) {
    const dbPath = options?.dbPath ?? resolve('data', 'astrokat.db');

    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');

    this.ensureTable();
  }

  record(snapshot: GuildSnapshot): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO guild_snapshots (guild_count, member_total, recorded_at, platform)
      VALUES (@guildCount, @memberTotal, @recordedAt, @platform)
    `);

    stmt.run({
      guildCount: snapshot.guildCount,
      memberTotal: snapshot.memberTotal,
      recordedAt: snapshot.recordedAt,
      platform: snapshot.platform,
    });

    return Promise.resolve();
  }

  getHistory(since?: number, platform?: string): Promise<GuildSnapshot[]> {
    let sql = 'SELECT guild_count, member_total, recorded_at, platform' + ' FROM guild_snapshots';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (platform) {
      conditions.push('platform = ?');
      params.push(platform);
    }

    if (since !== undefined) {
      conditions.push('recorded_at >= ?');
      params.push(since);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY recorded_at DESC LIMIT 1000';

    const rows = this.db.prepare(sql).all(...params) as Array<{
      guild_count: number;
      member_total: number;
      recorded_at: number;
      platform: string;
    }>;

    const snapshots: GuildSnapshot[] = rows.map((row) => ({
      guildCount: row.guild_count,
      memberTotal: row.member_total,
      recordedAt: row.recorded_at,
      platform: row.platform,
    }));

    return Promise.resolve(snapshots);
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_snapshots (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_count  INTEGER NOT NULL,
        member_total INTEGER NOT NULL,
        recorded_at  INTEGER NOT NULL,
        platform     TEXT    NOT NULL DEFAULT 'unknown'
      )
    `);

    // Migration: add platform column to existing databases
    const columns = this.db.pragma('table_info=guild_snapshots') as Array<{
      name: string;
    }>;
    if (!columns.some((c) => c.name === 'platform')) {
      this.db.exec(
        'ALTER TABLE guild_snapshots ADD COLUMN platform TEXT' + " NOT NULL DEFAULT 'unknown'"
      );
    }

    // Index for ordering by time (most recent first)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_guild_snapshots_recorded_at
      ON guild_snapshots (recorded_at)
    `);

    // Index for per-platform queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_guild_snapshots_platform
      ON guild_snapshots (platform, recorded_at)
    `);
  }
}
