import Database from 'better-sqlite3';
import type { GuildConfigStore, GuildConfig } from './guildConfigStore.js';

/** Options for constructing an `SqliteGuildConfigStore`. */
export interface SqliteGuildConfigStoreOptions {
  /** Path to the SQLite database file. */
  dbPath?: string;
}

/**
 * SQLite-backed guild config store.
 *
 * Stores all guild-level configuration in a single `guild_config`
 * table. Auto-creates the table on construction if it does not
 * already exist.
 */
export class SqliteGuildConfigStore implements GuildConfigStore {
  private readonly db: Database.Database;

  /**
   * @param options - Database path configuration.
   *   Falls back to `data/astrokat.db` when omitted.
   */
  constructor(options?: SqliteGuildConfigStoreOptions) {
    const dbPath = options?.dbPath ?? 'data/astrokat.db';
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureTable();
  }

  async get(guildId: string): Promise<GuildConfig> {
    const row = this.db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      return {
        guildId,
        rateLimitUserMax: null,
        rateLimitGuildMax: null,
        levelUpMessages: true,
      };
    }

    return {
      guildId,
      rateLimitUserMax: row.rate_limit_user_max != null ? Number(row.rate_limit_user_max) : null,
      rateLimitGuildMax: row.rate_limit_guild_max != null ? Number(row.rate_limit_guild_max) : null,
      levelUpMessages: Boolean(row.level_up_messages),
    };
  }

  async set(guildId: string, config: Partial<GuildConfig>): Promise<void> {
    const existing = this.db
      .prepare('SELECT * FROM guild_config WHERE guild_id = ?')
      .get(guildId) as Record<string, unknown> | undefined;

    const rateLimitUserMax =
      config.rateLimitUserMax !== undefined
        ? config.rateLimitUserMax
        : existing?.rate_limit_user_max != null
          ? Number(existing.rate_limit_user_max)
          : null;

    const rateLimitGuildMax =
      config.rateLimitGuildMax !== undefined
        ? config.rateLimitGuildMax
        : existing?.rate_limit_guild_max != null
          ? Number(existing.rate_limit_guild_max)
          : null;

    const levelUpMessages =
      config.levelUpMessages !== undefined
        ? config.levelUpMessages
        : existing
          ? Boolean(existing.level_up_messages)
          : true;

    this.db
      .prepare(
        `INSERT INTO guild_config
           (guild_id, rate_limit_user_max, rate_limit_guild_max, level_up_messages)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET
           rate_limit_user_max = EXCLUDED.rate_limit_user_max,
           rate_limit_guild_max = EXCLUDED.rate_limit_guild_max,
           level_up_messages = EXCLUDED.level_up_messages`
      )
      .run(guildId, rateLimitUserMax, rateLimitGuildMax, levelUpMessages ? 1 : 0);
  }

  /** Ensures the `guild_config` table exists with all columns. */
  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id TEXT PRIMARY KEY,
        rate_limit_user_max INTEGER,
        rate_limit_guild_max INTEGER,
        level_up_messages INTEGER NOT NULL DEFAULT 0
      )
    `);
  }
}
