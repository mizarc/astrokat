import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { RepStore, RepEntry } from './repStore.js';

export interface SqliteRepStoreOptions {
  /** Path to the SQLite database file. Defaults to `data/astrokat.db`. */
  dbPath?: string;
}

/**
 * SQLite-backed Reputation store.
 */
export class SqliteRepStore implements RepStore {
  private readonly db: Database.Database;

  constructor(options?: SqliteRepStoreOptions) {
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

  // ── Permanent Ledger ────────────────────────────────────────────────────

  async getEntry(guildId: string, userId: string): Promise<RepEntry | null> {
    const row = this.db
      .prepare('SELECT * FROM rep WHERE guild_id = ? AND user_id = ?')
      .get(guildId, userId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToEntry(row);
  }

  async addRepPoint(
    guildId: string,
    userId: string,
    platform: 'discord' | 'fluxer'
  ): Promise<void> {
    const now = Date.now();
    this.db
      .prepare(
        `
      INSERT INTO rep (guild_id, user_id, platform, rep, updated_at)
      VALUES (@guildId, @userId, @platform, 1, @updatedAt)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET
        rep        = rep + 1,
        platform   = EXCLUDED.platform,
        updated_at = EXCLUDED.updated_at
    `
      )
      .run({
        guildId,
        userId,
        platform,
        updatedAt: now,
      });
  }

  async getLeaderboard(guildId: string, limit: number, offset: number): Promise<RepEntry[]> {
    const rows = this.db
      .prepare('SELECT * FROM rep WHERE guild_id = ? ORDER BY rep DESC LIMIT ? OFFSET ?')
      .all(guildId, limit, offset) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntry(row));
  }

  async getUserRank(guildId: string, userId: string): Promise<number | null> {
    const row = this.db
      .prepare(
        `
      SELECT rank FROM (
        SELECT user_id, RANK() OVER (ORDER BY rep DESC) AS rank
        FROM rep
        WHERE guild_id = ?
      ) ranked
      WHERE user_id = ?
    `
      )
      .get(guildId, userId) as { rank: number } | undefined;

    return row?.rank ?? null;
  }

  async getMemberCount(guildId: string): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM rep WHERE guild_id = ?')
      .get(guildId) as { count: number };

    return row.count;
  }

  async recordDailyAllowance(guildId: string, giverId: string): Promise<void> {
    this.db
      .prepare(
        `
      INSERT INTO rep_daily_allowance (guild_id, giver_id, given_at)
      VALUES (@guildId, @giverId, @givenAt)
    `
      )
      .run({ guildId, giverId, givenAt: Date.now() });
  }

  async getDailyAllowanceCount(guildId: string, giverId: string): Promise<number> {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM rep_daily_allowance
         WHERE guild_id = ? AND giver_id = ? AND given_at > ?`
      )
      .get(guildId, giverId, cutoff) as { count: number };

    return row.count;
  }

  async recordTargetLockout(guildId: string, giverId: string, receiverId: string): Promise<void> {
    this.db
      .prepare(
        `
      INSERT INTO rep_target_lockout (guild_id, giver_id, receiver_id, given_at)
      VALUES (@guildId, @giverId, @receiverId, @givenAt)
      ON CONFLICT(guild_id, giver_id, receiver_id) DO UPDATE SET
        given_at = EXCLUDED.given_at
    `
      )
      .run({ guildId, giverId, receiverId, givenAt: Date.now() });
  }

  async hasActiveTargetLockout(
    guildId: string,
    giverId: string,
    receiverId: string
  ): Promise<boolean> {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const row = this.db
      .prepare(
        `SELECT 1
         FROM rep_target_lockout
         WHERE guild_id = ? AND giver_id = ?
           AND receiver_id = ? AND given_at > ?
         LIMIT 1`
      )
      .get(guildId, giverId, receiverId, cutoff);

    return row !== undefined;
  }

  async deleteAllByGuild(guildId: string): Promise<void> {
    this.db.prepare('DELETE FROM rep WHERE guild_id = ?').run(guildId);
    this.db.prepare('DELETE FROM rep_daily_allowance WHERE guild_id = ?').run(guildId);
    this.db.prepare('DELETE FROM rep_target_lockout WHERE guild_id = ?').run(guildId);
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

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rep (
        guild_id   TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        platform   TEXT NOT NULL DEFAULT 'discord',
        rep        INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      )
    `);

    // Index for leaderboard queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_rep_guild_rep
      ON rep (guild_id, rep DESC)
    `);

    // Records each rep-giving action for 24h counting
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rep_daily_allowance (
        guild_id TEXT NOT NULL,
        giver_id TEXT NOT NULL,
        given_at INTEGER NOT NULL
      )
    `);

    // Index for daily allowance lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_rep_daily_giver
      ON rep_daily_allowance (guild_id, giver_id, given_at DESC)
    `);

    // Target lockout table: tracks last rep time per giver→receiver pair
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rep_target_lockout (
        guild_id    TEXT NOT NULL,
        giver_id    TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        given_at    INTEGER NOT NULL,
        PRIMARY KEY (guild_id, giver_id, receiver_id)
      )
    `);
  }
}
