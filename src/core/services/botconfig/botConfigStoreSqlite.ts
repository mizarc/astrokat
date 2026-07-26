import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { BotConfigStore, BotConfigRow } from './botConfigStore.js';

export interface SqliteBotConfigStoreOptions {
  /** Path to the SQLite database file. Defaults to `data/astrokat.db`. */
  dbPath?: string;
}

/**
 * SQLite-backed global bot config store.
 *
 * Stores a single row per platform with fixed columns for status text,
 * emoji, and presence. Auto-creates the table on construction.
 */
export class SqliteBotConfigStore implements BotConfigStore {
  private readonly db: Database.Database;

  constructor(options?: SqliteBotConfigStoreOptions) {
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

  async get(platform: string): Promise<BotConfigRow | null> {
    const row = this.db.prepare('SELECT * FROM bot_configs WHERE platform = ?').get(platform) as
      | Record<string, unknown>
      | undefined;

    if (!row) return null;
    return this.rowToRow(row);
  }

  async getForPlatform(platform: string): Promise<BotConfigRow | null> {
    // Try platform-specific first
    const specific = this.db
      .prepare('SELECT * FROM bot_configs WHERE platform = ?')
      .get(platform) as Record<string, unknown> | undefined;

    if (specific) return this.rowToRow(specific);

    // Fall back to global (all platforms)
    const global = this.db.prepare('SELECT * FROM bot_configs WHERE platform = ?').get('') as
      | Record<string, unknown>
      | undefined;

    if (global) return this.rowToRow(global);

    return null;
  }

  async set(platform: string, row: Partial<BotConfigRow>): Promise<void> {
    const { statusText, statusEmojiName, statusEmojiId, presence } = row;

    this.db
      .prepare(
        `INSERT INTO bot_configs (platform, status_text, status_emoji_name, status_emoji_id, presence)
         VALUES (@platform, @statusText, @statusEmojiName, @statusEmojiId, @presence)
         ON CONFLICT(platform) DO UPDATE SET
           status_text       = COALESCE(excluded.status_text,       bot_configs.status_text),
           status_emoji_name = COALESCE(excluded.status_emoji_name, bot_configs.status_emoji_name),
           status_emoji_id   = COALESCE(excluded.status_emoji_id,   bot_configs.status_emoji_id),
           presence          = COALESCE(excluded.presence,          bot_configs.presence)`
      )
      .run({
        platform,
        statusText: statusText ?? null,
        statusEmojiName: statusEmojiName ?? null,
        statusEmojiId: statusEmojiId ?? null,
        presence: presence ?? null,
      });
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

  private ensureTable(): void {
    this.db.exec(`
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
