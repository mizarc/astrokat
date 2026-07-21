import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { LevelRoleStore, LevelRoleBinding, LevelRoleCreate } from './levelRoleStore.js';

export interface SqliteLevelRoleStoreOptions {
  /** Path to the SQLite database file. Defaults to `data/astrokat.db`. */
  dbPath?: string;
}

/**
 * SQLite-backed level-role store.
 */
export class SqliteLevelRoleStore implements LevelRoleStore {
  private readonly db: Database.Database;

  constructor(options?: SqliteLevelRoleStoreOptions) {
    const dbPath = options?.dbPath ?? resolve('data', 'astrokat.db');

    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureTable();
  }

  async create(binding: LevelRoleCreate): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO role_levels (guild_id, role_id, level, platform)
      VALUES (@guildId, @roleId, @level, @platform)
    `);

    const result = stmt.run({
      guildId: binding.guildId,
      roleId: binding.roleId,
      level: binding.level,
      platform: binding.platform,
    });

    return Number(result.lastInsertRowid);
  }

  async getByGuild(guildId: string): Promise<LevelRoleBinding[]> {
    const rows = this.db
      .prepare('SELECT * FROM role_levels WHERE guild_id = ? ORDER BY level ASC')
      .all(guildId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToBinding(row));
  }

  async getById(id: number): Promise<LevelRoleBinding | null> {
    const row = this.db.prepare('SELECT * FROM role_levels WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;

    if (!row) return null;
    return this.rowToBinding(row);
  }

  async getByGuildAndLevel(guildId: string, level: number): Promise<LevelRoleBinding | null> {
    const row = this.db
      .prepare('SELECT * FROM role_levels WHERE guild_id = ? AND level = ?')
      .get(guildId, level) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToBinding(row);
  }

  async getByGuildAndRole(guildId: string, roleId: string): Promise<LevelRoleBinding | null> {
    const row = this.db
      .prepare('SELECT * FROM role_levels WHERE guild_id = ? AND role_id = ?')
      .get(guildId, roleId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToBinding(row);
  }

  async getHighestForGuildUpToLevel(
    guildId: string,
    userLevel: number
  ): Promise<LevelRoleBinding | null> {
    const row = this.db
      .prepare(
        'SELECT * FROM role_levels WHERE guild_id = ? AND level <= ? ORDER BY level DESC LIMIT 1'
      )
      .get(guildId, userLevel) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToBinding(row);
  }

  async delete(id: number): Promise<void> {
    this.db.prepare('DELETE FROM role_levels WHERE id = ?').run(id);
  }

  async deleteByGuildAndRole(guildId: string, roleId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM role_levels WHERE guild_id = ? AND role_id = ?')
      .run(guildId, roleId);
  }

  async deleteByGuild(guildId: string): Promise<void> {
    this.db.prepare('DELETE FROM role_levels WHERE guild_id = ?').run(guildId);
  }

  async getAllBindings(): Promise<LevelRoleBinding[]> {
    const rows = this.db
      .prepare('SELECT * FROM role_levels ORDER BY guild_id, level ASC')
      .all() as Record<string, unknown>[];

    return rows.map((row) => this.rowToBinding(row));
  }

  async getAllGuildIds(): Promise<string[]> {
    const rows = this.db.prepare('SELECT DISTINCT guild_id FROM role_levels').all() as {
      guild_id: string;
    }[];

    return rows.map((row) => row.guild_id);
  }

  private rowToBinding(row: Record<string, unknown>): LevelRoleBinding {
    return {
      id: row.id as number,
      guildId: row.guild_id as string,
      roleId: row.role_id as string,
      level: row.level as number,
      platform: row.platform as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS role_levels (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id     TEXT NOT NULL,
        role_id      TEXT NOT NULL,
        level        INTEGER NOT NULL,
        platform     TEXT NOT NULL DEFAULT 'discord',
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(guild_id, level)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_role_levels_guild
      ON role_levels (guild_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_role_levels_guild_level
      ON role_levels (guild_id, level)
    `);
  }
}
