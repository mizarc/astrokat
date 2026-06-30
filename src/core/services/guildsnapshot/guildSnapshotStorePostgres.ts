import pg from 'pg';
import type { GuildSnapshotStore, GuildSnapshot } from './guildSnapshotStore.js';

const { Pool } = pg;

export interface PostgresGuildSnapshotStoreOptions {
  /** PostgreSQL connection string. Defaults to `DATABASE_URL` env var. */
  connectionString?: string;
  /** Max number of clients in the pool. Defaults to 5. */
  max?: number;
}

/**
 * PostgreSQL-backed guild snapshot store.
 *
 * Suitable for clustered / multi-instance deployments where multiple bot
 * processes need to share the same snapshot data.
 *
 * Connection is configured via `DATABASE_URL` environment variable, or
 * explicitly via `connectionString` in the options.
 */
export class PostgresGuildSnapshotStore implements GuildSnapshotStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresGuildSnapshotStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });

    this.ensureTable();
  }

  async record(snapshot: GuildSnapshot): Promise<void> {
    await this.pool.query(
      `INSERT INTO guild_snapshots (guild_count, member_total, recorded_at, platform)
       VALUES ($1, $2, $3, $4)`,
      [snapshot.guildCount, snapshot.memberTotal, snapshot.recordedAt, snapshot.platform]
    );
  }

  async getHistory(since?: number, platform?: string): Promise<GuildSnapshot[]> {
    let sql = 'SELECT guild_count, member_total, recorded_at, platform' + ' FROM guild_snapshots';
    const params: unknown[] = [];
    let paramIdx = 1;
    const conditions: string[] = [];

    if (platform) {
      conditions.push(`platform = $${paramIdx++}`);
      params.push(platform);
    }

    if (since !== undefined) {
      conditions.push(`recorded_at >= $${paramIdx++}`);
      params.push(since);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY recorded_at DESC LIMIT $${paramIdx}`;
    params.push(1000);

    const result = await this.pool.query(sql, params);

    return result.rows.map((row) => ({
      guildCount: row.guild_count,
      memberTotal: row.member_total,
      recordedAt: row.recorded_at,
      platform: row.platform,
    }));
  }

  /** Cleanly shut down the connection pool. Call on graceful shutdown. */
  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS guild_snapshots (
        id           SERIAL PRIMARY KEY,
        guild_count  INTEGER NOT NULL,
        member_total INTEGER NOT NULL,
        recorded_at  BIGINT  NOT NULL,
        platform     TEXT    NOT NULL DEFAULT 'unknown'
      )
    `);

    // Migration: add platform column to existing databases
    await this.pool.query(`
      ALTER TABLE guild_snapshots
      ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'unknown'
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_guild_snapshots_recorded_at
      ON guild_snapshots (recorded_at)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_guild_snapshots_platform
      ON guild_snapshots (platform, recorded_at)
    `);
  }
}
