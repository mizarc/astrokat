import pg from 'pg';
import type { XPStore, XPEntry, GuildConfig, KeywordBonus } from './xpStore.js';

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
      `INSERT INTO xp (guild_id, user_id, platform, xp, level, last_action_at, updated_at, xp_notifications)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
        entry.xpNotifications ?? false,
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

  async getGuildConfig(guildId: string): Promise<GuildConfig> {
    const result = await this.pool.query(
      'SELECT * FROM guild_config WHERE guild_id = $1',
      [guildId],
    );

    return {
      guildId,
      levelUpMessages: result.rows.length > 0 ? result.rows[0].level_up_messages : true,
    };
  }

  async setGuildConfig(guildId: string, config: Partial<GuildConfig>): Promise<void> {
    const existing = await this.pool.query(
      'SELECT * FROM guild_config WHERE guild_id = $1',
      [guildId],
    );

    const levelUpMessages = config.levelUpMessages ?? (existing.rows.length > 0 ? existing.rows[0].level_up_messages : true);

    await this.pool.query(
      `INSERT INTO guild_config (guild_id, level_up_messages)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET
         level_up_messages = EXCLUDED.level_up_messages`,
      [guildId, levelUpMessages],
    );
  }

  async setXpNotifications(guildId: string, userId: string, enabled: boolean): Promise<void> {
    await this.pool.query(
      'UPDATE xp SET xp_notifications = $1 WHERE guild_id = $2 AND user_id = $3',
      [enabled, guildId, userId],
    );
  }

  // ── Keyword bonuses ────────────────────────────────────────────────────

  async getKeywordBonus(guildId: string, keyword: string): Promise<number | null> {
    const result = await this.pool.query(
      'SELECT xp_amount FROM keyword_bonuses WHERE guild_id = $1 AND keyword = $2',
      [guildId, keyword.toLowerCase()],
    );

    return result.rows[0]?.xp_amount ?? null;
  }

  async setKeywordBonus(guildId: string, keyword: string, xpAmount: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO keyword_bonuses (guild_id, keyword, xp_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, keyword) DO UPDATE SET
         xp_amount = EXCLUDED.xp_amount`,
      [guildId, keyword.toLowerCase(), xpAmount],
    );
  }

  async removeKeywordBonus(guildId: string, keyword: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM keyword_bonuses WHERE guild_id = $1 AND keyword = $2',
      [guildId, keyword.toLowerCase()],
    );
  }

  async listKeywordBonuses(guildId: string): Promise<KeywordBonus[]> {
    const result = await this.pool.query(
      'SELECT * FROM keyword_bonuses WHERE guild_id = $1 ORDER BY keyword',
      [guildId],
    );

    return result.rows.map((row) => ({
      guildId: row.guild_id as string,
      keyword: row.keyword as string,
      xpAmount: row.xp_amount as number,
    }));
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
      xpNotifications: row.xp_notifications === undefined ? false : Boolean(row.xp_notifications),
    };
  }

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS xp (
        guild_id        TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        platform        TEXT NOT NULL DEFAULT 'discord',
        xp              INTEGER NOT NULL DEFAULT 0,
        level           INTEGER NOT NULL DEFAULT 0,
        last_action_at  BIGINT NOT NULL DEFAULT 0,
        updated_at      BIGINT NOT NULL,
        xp_notifications BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (guild_id, user_id)
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_xp_guild_xp
      ON xp (guild_id, xp DESC)
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id          TEXT PRIMARY KEY,
        level_up_messages BOOLEAN NOT NULL DEFAULT true
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS keyword_bonuses (
        guild_id  TEXT NOT NULL,
        keyword   TEXT NOT NULL,
        xp_amount INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, keyword)
      )
    `);
  }
}
