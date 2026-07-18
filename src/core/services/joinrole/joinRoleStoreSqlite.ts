import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { JoinRoleStore, JoinRoleBinding, JoinRoleCreate } from './joinRoleStore.js';

export interface SqliteJoinRoleStoreOptions {
  /** Path to the SQLite database file. Defaults to `data/astrokat.db`. */
  dbPath?: string;
}

/**
 * SQLite-backed join-role store.
 */
export class SqliteJoinRoleStore implements JoinRoleStore {
  private readonly db: Database.Database;

  constructor(options?: SqliteJoinRoleStoreOptions) {
    const dbPath = options?.dbPath ?? resolve('data', 'astrokat.db');

    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureTable();
  }

  async create(binding: JoinRoleCreate): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO join_roles (guild_id, role_id, platform, min_account_age_minutes, min_member_age_minutes)
      VALUES (@guildId, @roleId, @platform, @minAccountAgeMinutes, @minMemberAgeMinutes)
    `);

    const result = stmt.run({
      guildId: binding.guildId,
      roleId: binding.roleId,
      platform: binding.platform,
      minAccountAgeMinutes: binding.minAccountAgeMinutes ?? null,
      minMemberAgeMinutes: binding.minMemberAgeMinutes ?? null,
    });

    return Number(result.lastInsertRowid);
  }

  async getByGuild(guildId: string): Promise<JoinRoleBinding[]> {
    const rows = this.db
      .prepare('SELECT * FROM join_roles WHERE guild_id = ? ORDER BY created_at ASC')
      .all(guildId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToBinding(row));
  }

  async getById(id: number): Promise<JoinRoleBinding | null> {
    const row = this.db.prepare('SELECT * FROM join_roles WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;

    if (!row) return null;
    return this.rowToBinding(row);
  }

  async getByGuildAndRole(guildId: string, roleId: string): Promise<JoinRoleBinding | null> {
    const row = this.db
      .prepare('SELECT * FROM join_roles WHERE guild_id = ? AND role_id = ?')
      .get(guildId, roleId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToBinding(row);
  }

  async delete(id: number): Promise<void> {
    this.db.prepare('DELETE FROM join_roles WHERE id = ?').run(id);
  }

  async deleteByGuildAndRole(guildId: string, roleId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM join_roles WHERE guild_id = ? AND role_id = ?')
      .run(guildId, roleId);
  }

  async getAllBindings(): Promise<JoinRoleBinding[]> {
    const rows = this.db
      .prepare('SELECT * FROM join_roles ORDER BY guild_id, created_at ASC')
      .all() as Record<string, unknown>[];

    return rows.map((row) => this.rowToBinding(row));
  }

  async getAllGuildIds(): Promise<string[]> {
    const rows = this.db.prepare('SELECT DISTINCT guild_id FROM join_roles').all() as {
      guild_id: string;
    }[];

    return rows.map((row) => row.guild_id);
  }

  private rowToBinding(row: Record<string, unknown>): JoinRoleBinding {
    return {
      id: row.id as number,
      guildId: row.guild_id as string,
      roleId: row.role_id as string,
      platform: row.platform as string,
      minAccountAgeMinutes: row.min_account_age_minutes as number | null,
      minMemberAgeMinutes: row.min_member_age_minutes as number | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS join_roles (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id                TEXT NOT NULL,
        role_id                 TEXT NOT NULL,
        platform                TEXT NOT NULL DEFAULT 'discord',
        min_account_age_minutes INTEGER,
        min_member_age_minutes  INTEGER,
        created_at              TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(guild_id, role_id)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_join_roles_guild
      ON join_roles (guild_id)
    `);
  }
}
