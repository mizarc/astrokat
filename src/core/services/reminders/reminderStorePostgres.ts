import pg from 'pg';
import type { ReminderStore, Reminder, Platform } from './reminderStore.js';

const { Pool } = pg;

export interface PostgresReminderStoreOptions {
  /** PostgreSQL connection string. Defaults to `DATABASE_URL` env var. */
  connectionString?: string;
  /** Max number of clients in the pool. Defaults to 5. */
  max?: number;
}

/**
 * PostgreSQL-backed reminder store.
 *
 * Suitable for clustered / multi-instance deployments where multiple bot
 * processes need to share the same reminder data.
 *
 * Connection is configured via `DATABASE_URL` environment variable, or
 * explicitly via `connectionString` in the options.
 */
export class PostgresReminderStore implements ReminderStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresReminderStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });

    this.ensureTable();
  }

  async save(reminder: Reminder): Promise<void> {
    await this.pool.query(
      `INSERT INTO reminders (id, user_id, channel_id, guild_id, platform, message, dispatch_time, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         user_id       = EXCLUDED.user_id,
         channel_id    = EXCLUDED.channel_id,
         guild_id      = EXCLUDED.guild_id,
         platform      = EXCLUDED.platform,
         message       = EXCLUDED.message,
         dispatch_time = EXCLUDED.dispatch_time,
         created_at    = EXCLUDED.created_at`,
      [
        reminder.id,
        reminder.userId,
        reminder.channelId,
        reminder.guildId,
        reminder.platform,
        reminder.message,
        reminder.dispatchTime,
        reminder.createdAt,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM reminders WHERE id = $1', [id]);
  }

  async loadAll(platform?: Platform): Promise<Reminder[]> {
    const result = platform
      ? await this.pool.query('SELECT * FROM reminders WHERE platform = $1', [platform])
      : await this.pool.query('SELECT * FROM reminders');

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      channelId: row.channel_id,
      guildId: row.guild_id,
      platform: row.platform as Platform,
      message: row.message,
      dispatchTime: row.dispatch_time,
      createdAt: row.created_at,
    }));
  }

  /** Cleanly shut down the connection pool. Call on graceful shutdown. */
  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
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

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reminders_dispatch_time
      ON reminders (dispatch_time)
    `);
  }
}
