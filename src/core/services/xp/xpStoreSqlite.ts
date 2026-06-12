import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { XPStore, XPEntry, GuildConfig, KeywordBonus } from './xpStore.js';

export interface SqliteXPStoreOptions {
  /** Path to the SQLite database file. Defaults to `data/astrokat.db`. */
  dbPath?: string;
}

/**
 * SQLite-backed XP store.
 */
export class SqliteXPStore implements XPStore {
  private readonly db: Database.Database;

  constructor(options?: SqliteXPStoreOptions) {
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

  async getEntry(guildId: string, userId: string): Promise<XPEntry | null> {
    const row = this.db.prepare(
      'SELECT * FROM xp WHERE guild_id = ? AND user_id = ?',
    ).get(guildId, userId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToEntry(row);
  }

  async upsertEntry(entry: XPEntry): Promise<void> {
    this.db.prepare(`
      INSERT INTO xp (guild_id, user_id, platform, xp, level, last_action_at, updated_at, xp_notifications)
      VALUES (@guildId, @userId, @platform, @xp, @level, @lastActionAt, @updatedAt, @xpNotifications)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET
        xp             = EXCLUDED.xp,
        level          = EXCLUDED.level,
        platform       = EXCLUDED.platform,
        last_action_at = EXCLUDED.last_action_at,
        updated_at     = EXCLUDED.updated_at
    `).run({
      guildId: entry.guildId,
      userId: entry.userId,
      platform: entry.platform,
      xp: entry.xp,
      level: entry.level,
      lastActionAt: entry.lastActionAt,
      updatedAt: entry.updatedAt,
      xpNotifications: (entry.xpNotifications ?? false) ? 1 : 0,
    });
  }

  async getLeaderboard(guildId: string, limit: number, offset: number): Promise<XPEntry[]> {
    const rows = this.db.prepare(
      'SELECT * FROM xp WHERE guild_id = ? ORDER BY xp DESC LIMIT ? OFFSET ?',
    ).all(guildId, limit, offset) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntry(row));
  }

  async getUserRank(guildId: string, userId: string): Promise<number | null> {
    const row = this.db.prepare(`
      SELECT rank FROM (
        SELECT user_id, RANK() OVER (ORDER BY xp DESC) AS rank
        FROM xp
        WHERE guild_id = ?
      ) ranked
      WHERE user_id = ?
    `).get(guildId, userId) as { rank: number } | undefined;

    return row?.rank ?? null;
  }

  async getMemberCount(guildId: string): Promise<number> {
    const row = this.db.prepare(
      'SELECT COUNT(*) AS count FROM xp WHERE guild_id = ?',
    ).get(guildId) as { count: number };

    return row.count;
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

  async getGuildConfig(guildId: string): Promise<GuildConfig> {
    const row = this.db.prepare(
      'SELECT * FROM guild_config WHERE guild_id = ?',
    ).get(guildId) as Record<string, unknown> | undefined;

    return {
      guildId,
      levelUpMessages: row ? Boolean(row.level_up_messages) : true,
    };
  }

  async setGuildConfig(guildId: string, config: Partial<GuildConfig>): Promise<void> {
    const existing = this.db.prepare(
      'SELECT * FROM guild_config WHERE guild_id = ?',
    ).get(guildId) as Record<string, unknown> | undefined;

    const levelUpMessages = config.levelUpMessages ?? (existing ? Boolean(existing.level_up_messages) : true);

    this.db.prepare(`
      INSERT INTO guild_config (guild_id, level_up_messages)
      VALUES (?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        level_up_messages = EXCLUDED.level_up_messages
    `).run(guildId, levelUpMessages ? 1 : 0);
  }

  async setXpNotifications(guildId: string, userId: string, enabled: boolean): Promise<void> {
    this.db.prepare(`
      UPDATE xp SET xp_notifications = ? WHERE guild_id = ? AND user_id = ?
    `).run(enabled ? 1 : 0, guildId, userId);
  }

  // ── Keyword bonuses ────────────────────────────────────────────────────

  async getKeywordBonus(guildId: string, keyword: string): Promise<number | null> {
    const row = this.db.prepare(
      'SELECT xp_amount FROM keyword_bonuses WHERE guild_id = ? AND keyword = ?',
    ).get(guildId, keyword.toLowerCase()) as { xp_amount: number } | undefined;

    return row?.xp_amount ?? null;
  }

  async setKeywordBonus(guildId: string, keyword: string, xpAmount: number): Promise<void> {
    this.db.prepare(`
      INSERT INTO keyword_bonuses (guild_id, keyword, xp_amount)
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id, keyword) DO UPDATE SET
        xp_amount = EXCLUDED.xp_amount
    `).run(guildId, keyword.toLowerCase(), xpAmount);
  }

  async removeKeywordBonus(guildId: string, keyword: string): Promise<void> {
    this.db.prepare(
      'DELETE FROM keyword_bonuses WHERE guild_id = ? AND keyword = ?',
    ).run(guildId, keyword.toLowerCase());
  }

  async listKeywordBonuses(guildId: string): Promise<KeywordBonus[]> {
    const rows = this.db.prepare(
      'SELECT * FROM keyword_bonuses WHERE guild_id = ? ORDER BY keyword',
    ).all(guildId) as Record<string, unknown>[];

    return rows.map((row) => ({
      guildId: row.guild_id as string,
      keyword: row.keyword as string,
      xpAmount: row.xp_amount as number,
    }));
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS xp (
        guild_id        TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        platform        TEXT NOT NULL DEFAULT 'discord',
        xp              INTEGER NOT NULL DEFAULT 0,
        level           INTEGER NOT NULL DEFAULT 0,
        last_action_at  INTEGER NOT NULL DEFAULT 0,
        updated_at      INTEGER NOT NULL,
        xp_notifications INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      )
    `);

    // Index for leaderboard queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_xp_guild_xp
      ON xp (guild_id, xp DESC)
    `);

    // Guild-level config table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id          TEXT PRIMARY KEY,
        level_up_messages INTEGER NOT NULL DEFAULT 1
      )
    `);

    // Keyword bonus table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS keyword_bonuses (
        guild_id  TEXT NOT NULL,
        keyword   TEXT NOT NULL,
        xp_amount INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, keyword)
      )
    `);
  }
}
