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
      `INSERT INTO guild_snapshots (guild_count, member_total, recorded_at)
       VALUES ($1, $2, $3)`,
      [snapshot.guildCount, snapshot.memberTotal, snapshot.recordedAt]
    );
  }

  async getHistory(limit = 100): Promise<GuildSnapshot[]> {
    const result = await this.pool.query(
      'SELECT guild_count, member_total, recorded_at' +
        ' FROM guild_snapshots ORDER BY recorded_at DESC LIMIT $1',
      [limit]
    );

    return result.rows.map((row) => ({
      guildCount: row.guild_count,
      memberTotal: row.member_total,
      recordedAt: row.recorded_at,
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
        recorded_at  BIGINT  NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_guild_snapshots_recorded_at
      ON guild_snapshots (recorded_at)
    `);
  }
}
