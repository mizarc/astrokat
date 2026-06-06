import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ReminderStore, Reminder, Platform } from './reminderStore.js';

export interface SqliteReminderStoreOptions {
  /** Path to the SQLite database file. Defaults to `data/spacecat.db`. */
  dbPath?: string;
}

/**
 * SQLite-backed reminder store.
 *
 * Embedded, ACID-compliant, zero setup. Suitable for single-instance
 * deployments (the common case for self-hosted bots).
 *
 * For multi-instance / clustered deployments, swap to a `PostgresReminderStore`
 * (shares the same `ReminderStore` interface).
 */
export class SqliteReminderStore implements ReminderStore {
  private readonly db: Database.Database;

  constructor(options?: SqliteReminderStoreOptions) {
    const dbPath = options?.dbPath ?? resolve('data', 'spacecat.db');

    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');

    this.ensureTable();
  }

  save(reminder: Reminder): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO reminders (id, user_id, channel_id, guild_id, platform, message, dispatch_time, created_at)
      VALUES (@id, @userId, @channelId, @guildId, @platform, @message, @dispatchTime, @createdAt)
    `);

    stmt.run({
      id: reminder.id,
      userId: reminder.userId,
      channelId: reminder.channelId,
      guildId: reminder.guildId,
      platform: reminder.platform,
      message: reminder.message,
      dispatchTime: reminder.dispatchTime,
      createdAt: reminder.createdAt,
    });

    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM reminders WHERE id = ?');
    stmt.run(id);
    return Promise.resolve();
  }

  loadAll(platform?: Platform): Promise<Reminder[]> {
    const rows = platform
      ? this.db.prepare('SELECT * FROM reminders WHERE platform = ?').all(platform)
      : this.db.prepare('SELECT * FROM reminders').all();

    const reminders: Reminder[] = (rows as Array<{
      id: string;
      user_id: string;
      channel_id: string;
      guild_id: string;
      platform: string;
      message: string;
      dispatch_time: number;
      created_at: number;
    }>).map((row) => ({
      id: row.id,
      userId: row.user_id,
      channelId: row.channel_id,
      guildId: row.guild_id,
      platform: row.platform as Platform,
      message: row.message,
      dispatchTime: row.dispatch_time,
      createdAt: row.created_at,
    }));

    return Promise.resolve(reminders);
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reminders (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL,
        channel_id   TEXT NOT NULL,
        guild_id     TEXT NOT NULL,
        platform     TEXT NOT NULL DEFAULT 'discord',
        message      TEXT NOT NULL,
        dispatch_time INTEGER NOT NULL,
        created_at   INTEGER NOT NULL
      )
    `);

    // Index on dispatch_time so init() can quickly find due reminders
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reminders_dispatch_time
      ON reminders (dispatch_time)
    `);
  }
}
