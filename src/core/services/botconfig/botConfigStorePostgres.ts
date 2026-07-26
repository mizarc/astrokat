import pg from 'pg';
import type { BotConfigStore, BotConfigRow } from './botConfigStore.js';

const { Pool } = pg;

export interface PostgresBotConfigStoreOptions {
  /** PostgreSQL connection string. Defaults to `DATABASE_URL` env var. */
  connectionString?: string;
  /** Max number of clients in the pool. Defaults to 5. */
  max?: number;
}

/**
 * PostgreSQL-backed global bot config store.
 *
 * Stores a single row per platform with fixed columns for status text,
 * emoji, and presence. Auto-creates the table on construction.
 */
export class PostgresBotConfigStore implements BotConfigStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresBotConfigStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });

    this.ensureTable();
  }

  async get(platform: string): Promise<BotConfigRow | null> {
    const result = await this.pool.query('SELECT * FROM bot_configs WHERE platform = $1', [
      platform,
    ]);

    if (result.rows.length === 0) return null;
    return this.rowToRow(result.rows[0]);
  }

  async getForPlatform(platform: string): Promise<BotConfigRow | null> {
    // Try platform-specific first
    const specific = await this.pool.query('SELECT * FROM bot_configs WHERE platform = $1', [
      platform,
    ]);

    if (specific.rows.length > 0) return this.rowToRow(specific.rows[0]);

    // Fall back to global (all platforms)
    const global = await this.pool.query('SELECT * FROM bot_configs WHERE platform = $1', ['']);

    if (global.rows.length > 0) return this.rowToRow(global.rows[0]);

    return null;
  }

  async set(platform: string, row: Partial<BotConfigRow>): Promise<void> {
    const { statusText, statusEmojiName, statusEmojiId, presence } = row;

    await this.pool.query(
      `INSERT INTO bot_configs (platform, status_text, status_emoji_name, status_emoji_id, presence)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (platform) DO UPDATE SET
         status_text       = COALESCE($2, bot_configs.status_text),
         status_emoji_name = COALESCE($3, bot_configs.status_emoji_name),
         status_emoji_id   = COALESCE($4, bot_configs.status_emoji_id),
         presence          = COALESCE($5, bot_configs.presence)`,
      [
        platform,
        statusText ?? null,
        statusEmojiName ?? null,
        statusEmojiId ?? null,
        presence ?? null,
      ]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private rowToRow(row: Record<string, unknown>): BotConfigRow {
    return {
      platform: row.platform as string,
      statusText: row.status_text as string | null,
      statusEmojiName: row.status_emoji_name as string | null,
      statusEmojiId: row.status_emoji_id as string | null,
      presence: row.presence as string | null,
    };
  }

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS bot_configs (
        platform          TEXT NOT NULL PRIMARY KEY,
        status_text       TEXT,
        status_emoji_name TEXT,
        status_emoji_id   TEXT,
        presence          TEXT
      )
    `);
  }
}
