import pg from 'pg';
import type { XPStore, XPEntry } from './xpStore.js';

const { Pool } = pg;

export interface PostgresXPStoreOptions {
  /** PostgreSQL connection string. Defaults to `DATABASE_URL` env var. */
  connectionString?: string;
  /** Max number of clients in the pool. Defaults to 5. */
  max?: number;
}

/**
 * PostgreSQL-backed XP store.
 */
export class PostgresXPStore implements XPStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresXPStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });

    this.ensureTable();
  }

  async getEntry(guildId: string, userId: string): Promise<XPEntry | null> {
    const result = await this.pool.query(
      'SELECT * FROM xp WHERE guild_id = $1 AND user_id = $2',
      [guildId, userId],
    );

    if (result.rows.length === 0) return null;
    return this.rowToEntry(result.rows[0]);
  }

  async upsertEntry(entry: XPEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO xp (guild_id, user_id, platform, xp, level, last_action_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         xp             = EXCLUDED.xp,
         level          = EXCLUDED.level,
         platform       = EXCLUDED.platform,
         last_action_at = EXCLUDED.last_action_at,
         updated_at     = EXCLUDED.updated_at`,
      [
        entry.guildId,
        entry.userId,
        entry.platform,
        entry.xp,
        entry.level,
        entry.lastActionAt,
        entry.updatedAt,
      ],
    );
  }

  async getLeaderboard(guildId: string, limit: number, offset: number): Promise<XPEntry[]> {
    const result = await this.pool.query(
      'SELECT * FROM xp WHERE guild_id = $1 ORDER BY xp DESC LIMIT $2 OFFSET $3',
      [guildId, limit, offset],
    );

    return result.rows.map((row) => this.rowToEntry(row));
  }

  async getUserRank(guildId: string, userId: string): Promise<number | null> {
    const result = await this.pool.query(
      `SELECT rank FROM (
        SELECT user_id, RANK() OVER (ORDER BY xp DESC) AS rank
        FROM xp
        WHERE guild_id = $1
      ) ranked
      WHERE user_id = $2`,
      [guildId, userId],
    );

    return result.rows[0]?.rank ?? null;
  }

  async getMemberCount(guildId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) AS count FROM xp WHERE guild_id = $1',
      [guildId],
    );

    return parseInt(result.rows[0].count, 10);
  }

  private rowToEntry(row: Record<string, unknown>): XPEntry {
    return {
      guildId: row.guild_id as string,
      userId: row.user_id as string,
      platform: row.platform as 'discord' | 'fluxer',
      xp: row.xp as number,
      level: row.level as number,
      lastActionAt: row.last_action_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS xp (
        guild_id       TEXT NOT NULL,
        user_id        TEXT NOT NULL,
        platform       TEXT NOT NULL DEFAULT 'discord',
        xp             INTEGER NOT NULL DEFAULT 0,
        level          INTEGER NOT NULL DEFAULT 0,
        last_action_at INTEGER NOT NULL DEFAULT 0,
        updated_at     INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_xp_guild_xp
      ON xp (guild_id, xp DESC)
    `);
  }
}
