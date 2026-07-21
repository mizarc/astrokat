import pg from 'pg';
import type { RepStore, RepEntry } from './repStore.js';

const { Pool } = pg;

export interface PostgresRepStoreOptions {
  /** PostgreSQL connection string. Defaults to `DATABASE_URL` env var. */
  connectionString?: string;
  /** Max number of clients in the pool. Defaults to 5. */
  max?: number;
}

/**
 * PostgreSQL-backed Reputation store.
 */
export class PostgresRepStore implements RepStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresRepStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });

    this.ensureTable();
  }

  // ── Permanent Ledger ────────────────────────────────────────────────────

  async getEntry(guildId: string, userId: string): Promise<RepEntry | null> {
    const result = await this.pool.query(
      'SELECT * FROM rep WHERE guild_id = $1 AND user_id = $2',
      [guildId, userId]
    );

    if (result.rows.length === 0) return null;
    return this.rowToEntry(result.rows[0]);
  }

  async addRepPoint(
    guildId: string,
    userId: string,
    platform: 'discord' | 'fluxer'
  ): Promise<void> {
    const now = Date.now();
    await this.pool.query(
      `INSERT INTO rep (guild_id, user_id, platform, rep, updated_at)
       VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         rep        = rep + 1,
         platform   = EXCLUDED.platform,
         updated_at = EXCLUDED.updated_at`,
      [guildId, userId, platform, now]
    );
  }

  async getLeaderboard(guildId: string, limit: number, offset: number): Promise<RepEntry[]> {
    const result = await this.pool.query(
      'SELECT * FROM rep WHERE guild_id = $1 ORDER BY rep DESC LIMIT $2 OFFSET $3',
      [guildId, limit, offset]
    );

    return result.rows.map((row) => this.rowToEntry(row));
  }

  async getUserRank(guildId: string, userId: string): Promise<number | null> {
    const result = await this.pool.query(
      `SELECT rank FROM (
        SELECT user_id, RANK() OVER (ORDER BY rep DESC) AS rank
        FROM rep
        WHERE guild_id = $1
      ) ranked
      WHERE user_id = $2`,
      [guildId, userId]
    );

    return result.rows[0]?.rank ?? null;
  }

  async getMemberCount(guildId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) AS count FROM rep WHERE guild_id = $1',
      [guildId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  async recordDailyAllowance(guildId: string, giverId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO rep_history (guild_id, giver_id, given_at)
       VALUES ($1, $2, $3)`,
      [guildId, giverId, Date.now()]
    );
  }

  async getDailyAllowanceCount(guildId: string, giverId: string): Promise<number> {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const result = await this.pool.query(
      `SELECT COUNT(*) AS count
       FROM rep_history
       WHERE guild_id = $1 AND giver_id = $2 AND given_at > $3`,
      [guildId, giverId, cutoff]
    );

    return parseInt(result.rows[0].count, 10);
  }

  async recordTargetLockout(guildId: string, giverId: string, receiverId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO rep_target_lockouts (guild_id, giver_id, receiver_id, given_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (guild_id, giver_id, receiver_id) DO UPDATE SET
         given_at = EXCLUDED.given_at`,
      [guildId, giverId, receiverId, Date.now()]
    );
  }

  async hasActiveTargetLockout(
    guildId: string,
    giverId: string,
    receiverId: string
  ): Promise<boolean> {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const result = await this.pool.query(
      `SELECT 1
       FROM rep_target_lockouts
       WHERE guild_id = $1 AND giver_id = $2
         AND receiver_id = $3 AND given_at > $4
       LIMIT 1`,
      [guildId, giverId, receiverId, cutoff]
    );

    return result.rows.length > 0;
  }

  async deleteAllByGuild(guildId: string): Promise<void> {
    await this.pool.query('DELETE FROM rep WHERE guild_id = $1', [guildId]);
    await this.pool.query('DELETE FROM rep_history WHERE guild_id = $1', [guildId]);
    await this.pool.query('DELETE FROM rep_target_lockouts WHERE guild_id = $1', [guildId]);
  }

  private rowToEntry(row: Record<string, unknown>): RepEntry {
    return {
      guildId: row.guild_id as string,
      userId: row.user_id as string,
      platform: row.platform as 'discord' | 'fluxer',
      rep: row.rep as number,
      updatedAt: row.updated_at as number,
    };
  }

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rep (
        guild_id   TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        platform   TEXT NOT NULL DEFAULT 'discord',
        rep        INTEGER NOT NULL DEFAULT 0,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_rep_guild_rep
      ON rep (guild_id, rep DESC)
    `);

    // Daily allowance table: records each rep-giving action for 24h counting
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rep_history (
        id       BIGSERIAL,
        guild_id TEXT NOT NULL,
        giver_id TEXT NOT NULL,
        given_at BIGINT NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_rep_daily_giver
      ON rep_history (guild_id, giver_id, given_at DESC)
    `);

    // Target lockout table: tracks last rep time per giver→receiver pair
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rep_target_lockouts (
        guild_id    TEXT NOT NULL,
        giver_id    TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        given_at    BIGINT NOT NULL,
        PRIMARY KEY (guild_id, giver_id, receiver_id)
      )
    `);
  }
}
