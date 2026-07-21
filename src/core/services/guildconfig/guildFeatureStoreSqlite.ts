import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { GuildFeatureStore } from './guildFeatureStore.js';

export interface SqliteGuildFeatureStoreOptions {
  dbPath?: string;
}

export class SqliteGuildFeatureStore implements GuildFeatureStore {
  private readonly db: Database.Database;

  constructor(options?: SqliteGuildFeatureStoreOptions) {
    const dbPath = options?.dbPath ?? resolve('data', 'astrokat.db');
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureTable();
  }

  async isEnabled(guildId: string, feature: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT enabled FROM guild_features WHERE guild_id = ? AND feature = ?')
      .get(guildId, feature) as { enabled: number } | undefined;
    return row ? Boolean(row.enabled) : true; // default true (opt-out)
  }

  async set(guildId: string, feature: string, enabled: boolean): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO guild_features (guild_id, feature, enabled)
         VALUES (?, ?, ?)
         ON CONFLICT(guild_id, feature) DO UPDATE SET enabled = EXCLUDED.enabled`
      )
      .run(guildId, feature, enabled ? 1 : 0);
  }

  async getAll(guildId: string): Promise<Record<string, boolean>> {
    const rows = this.db
      .prepare('SELECT feature, enabled FROM guild_features WHERE guild_id = ?')
      .all(guildId) as { feature: string; enabled: number }[];

    const map: Record<string, boolean> = {};
    for (const row of rows) {
      map[row.feature] = Boolean(row.enabled);
    }
    return map;
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_features (
        guild_id TEXT NOT NULL,
        feature  TEXT NOT NULL,
        enabled  INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (guild_id, feature)
      )
    `);
  }
}
