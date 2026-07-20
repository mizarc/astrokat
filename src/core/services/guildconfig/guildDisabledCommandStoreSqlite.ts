import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { GuildDisabledCommandStore } from './guildDisabledCommandStore.js';

export interface SqliteGuildDisabledCommandStoreOptions {
  dbPath?: string;
}

export class SqliteGuildDisabledCommandStore implements GuildDisabledCommandStore {
  private readonly db: Database.Database;

  constructor(options?: SqliteGuildDisabledCommandStoreOptions) {
    const dbPath = options?.dbPath ?? resolve('data', 'astrokat.db');
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureTable();
  }

  async isDisabled(guildId: string, commandName: string): Promise<boolean> {
    const row = this.db
      .prepare('SELECT 1 FROM guild_disabled_commands WHERE guild_id = ? AND command_name = ?')
      .get(guildId, commandName);
    return row !== undefined;
  }

  async getAll(guildId: string): Promise<string[]> {
    const rows = this.db
      .prepare(
        'SELECT command_name FROM guild_disabled_commands WHERE guild_id = ? ORDER BY command_name'
      )
      .all(guildId) as { command_name: string }[];
    return rows.map((r) => r.command_name);
  }

  async add(guildId: string, commandName: string): Promise<void> {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO guild_disabled_commands (guild_id, command_name) VALUES (?, ?)'
      )
      .run(guildId, commandName);
  }

  async remove(guildId: string, commandName: string): Promise<void> {
    this.db
      .prepare('DELETE FROM guild_disabled_commands WHERE guild_id = ? AND command_name = ?')
      .run(guildId, commandName);
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_disabled_commands (
        guild_id     TEXT NOT NULL,
        command_name TEXT NOT NULL,
        PRIMARY KEY (guild_id, command_name)
      )
    `);
  }
}
