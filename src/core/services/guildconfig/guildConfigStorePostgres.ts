import pg from 'pg';
import type { GuildConfigStore, GuildConfig } from './guildConfigStore.js';

const { Pool } = pg;

/** Options for constructing a `PostgresGuildConfigStore`. */
export interface PostgresGuildConfigStoreOptions {
  /** PostgreSQL connection string. */
  connectionString?: string;

  /** Max number of clients in the connection pool. */
  max?: number;
}

/**
 * PostgreSQL-backed guild config store.
 *
 * Stores all guild-level configuration in a single `guild_config`
 * table. Auto-creates the table on construction if it does not
 * already exist.
 */
export class PostgresGuildConfigStore implements GuildConfigStore {
  private readonly pool: pg.Pool;

  /**
   * @param options - Connection and pool configuration.
   *   Falls back to `DATABASE_URL` and a pool size of 5
   *   when omitted.
   */
  constructor(options?: PostgresGuildConfigStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });

    this.ensureTable();
  }

  async get(guildId: string): Promise<GuildConfig> {
    const result = await this.pool.query('SELECT * FROM guild_config WHERE guild_id = $1', [
      guildId,
    ]);

    if (result.rows.length === 0) {
      return {
        guildId,
        rateLimitUserMax: null,
        rateLimitGuildMax: null,
        levelUpMessages: true,
        reactionRolePerMessageLimit: null,
        reactionRolePerGuildLimit: null,
        prefix: null,
      };
    }

    const r = result.rows[0];

    return {
      guildId,
      rateLimitUserMax: r.rate_limit_user_max ?? null,
      rateLimitGuildMax: r.rate_limit_guild_max ?? null,
      levelUpMessages: r.level_up_messages,
      reactionRolePerMessageLimit: r.reaction_role_per_message_limit ?? null,
      reactionRolePerGuildLimit: r.reaction_role_per_guild_limit ?? null,
      prefix: r.prefix ?? null,
    };
  }

  async set(guildId: string, config: Partial<GuildConfig>): Promise<void> {
    const existing = await this.pool.query('SELECT * FROM guild_config WHERE guild_id = $1', [
      guildId,
    ]);

    const hasExisting = existing.rows.length > 0;

    const rateLimitUserMax =
      config.rateLimitUserMax !== undefined
        ? config.rateLimitUserMax
        : hasExisting
          ? existing.rows[0].rate_limit_user_max
          : null;

    const rateLimitGuildMax =
      config.rateLimitGuildMax !== undefined
        ? config.rateLimitGuildMax
        : hasExisting
          ? existing.rows[0].rate_limit_guild_max
          : null;

    const levelUpMessages =
      config.levelUpMessages !== undefined
        ? config.levelUpMessages
        : hasExisting
          ? existing.rows[0].level_up_messages
          : true;

    const reactionRolePerMessageLimit =
      config.reactionRolePerMessageLimit !== undefined
        ? config.reactionRolePerMessageLimit
        : hasExisting
          ? existing.rows[0].reaction_role_per_message_limit
          : null;

    const reactionRolePerGuildLimit =
      config.reactionRolePerGuildLimit !== undefined
        ? config.reactionRolePerGuildLimit
        : hasExisting
          ? existing.rows[0].reaction_role_per_guild_limit
          : null;

    const prefix =
      config.prefix !== undefined ? config.prefix : hasExisting ? existing.rows[0].prefix : null;

    await this.pool.query(
      `INSERT INTO guild_config
         (guild_id, rate_limit_user_max, rate_limit_guild_max, level_up_messages, reaction_role_per_message_limit, reaction_role_per_guild_limit, prefix)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (guild_id) DO UPDATE SET
         rate_limit_user_max = EXCLUDED.rate_limit_user_max,
         rate_limit_guild_max = EXCLUDED.rate_limit_guild_max,
         level_up_messages = EXCLUDED.level_up_messages,
         reaction_role_per_message_limit = EXCLUDED.reaction_role_per_message_limit,
         reaction_role_per_guild_limit = EXCLUDED.reaction_role_per_guild_limit,
         prefix = EXCLUDED.prefix`,
      [
        guildId,
        rateLimitUserMax,
        rateLimitGuildMax,
        levelUpMessages,
        reactionRolePerMessageLimit,
        reactionRolePerGuildLimit,
        prefix,
      ]
    );
  }

  /** Ensures the `guild_config` table exists with all columns. */
  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id TEXT PRIMARY KEY,
        rate_limit_user_max INTEGER,
        rate_limit_guild_max INTEGER,
        level_up_messages BOOLEAN NOT NULL DEFAULT false
      )
    `);

    // Migrate: add columns that may be missing from older schemas.
    // PostgreSQL ignores IF NOT EXISTS when the column already
    // exists, so repeated runs are safe.
    await this.pool.query(`
      ALTER TABLE guild_config
        ADD COLUMN IF NOT EXISTS rate_limit_user_max INTEGER
    `);
    await this.pool.query(`
      ALTER TABLE guild_config
        ADD COLUMN IF NOT EXISTS rate_limit_guild_max INTEGER
    `);
    await this.pool.query(`
      ALTER TABLE guild_config
        ADD COLUMN IF NOT EXISTS reaction_role_per_message_limit INTEGER
    `);
    await this.pool.query(`
      ALTER TABLE guild_config
        ADD COLUMN IF NOT EXISTS reaction_role_per_guild_limit INTEGER
    `);
    await this.pool.query(`
      ALTER TABLE guild_config
        ADD COLUMN IF NOT EXISTS prefix TEXT
    `);
  }
}
