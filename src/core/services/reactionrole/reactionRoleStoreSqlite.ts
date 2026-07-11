import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type {
  ReactionRoleStore,
  ReactionRoleBinding,
  ReactionRoleCreate,
} from './reactionRoleStore.js';

export interface SqliteReactionRoleStoreOptions {
  /** Path to the SQLite database file. Defaults to `data/astrokat.db`. */
  dbPath?: string;
}

/**
 * SQLite-backed reaction role store.
 */
export class SqliteReactionRoleStore implements ReactionRoleStore {
  private readonly db: Database.Database;

  constructor(options?: SqliteReactionRoleStoreOptions) {
    const dbPath = options?.dbPath ?? resolve('data', 'astrokat.db');

    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureTable();
  }

  async create(binding: ReactionRoleCreate): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO reaction_roles (guild_id, message_id, emoji, role_id, platform)
      VALUES (@guildId, @messageId, @emoji, @roleId, @platform)
    `);

    const result = stmt.run({
      guildId: binding.guildId,
      messageId: binding.messageId,
      emoji: binding.emoji,
      roleId: binding.roleId,
      platform: binding.platform,
    });

    return Number(result.lastInsertRowid);
  }

  async getByGuild(guildId: string): Promise<ReactionRoleBinding[]> {
    const rows = this.db
      .prepare('SELECT * FROM reaction_roles WHERE guild_id = ? ORDER BY created_at ASC')
      .all(guildId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToBinding(row));
  }

  async getByMessage(guildId: string, messageId: string): Promise<ReactionRoleBinding[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ? ORDER BY created_at ASC'
      )
      .all(guildId, messageId) as Record<string, unknown>[];

    return rows.map((row) => this.rowToBinding(row));
  }

  async getById(id: number): Promise<ReactionRoleBinding | null> {
    const row = this.db.prepare('SELECT * FROM reaction_roles WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;

    if (!row) return null;
    return this.rowToBinding(row);
  }

  async getByMessageAndEmoji(
    guildId: string,
    messageId: string,
    emoji: string
  ): Promise<ReactionRoleBinding | null> {
    const row = this.db
      .prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND emoji = ?')
      .get(guildId, messageId, emoji) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToBinding(row);
  }

  async delete(id: number): Promise<void> {
    this.db.prepare('DELETE FROM reaction_roles WHERE id = ?').run(id);
  }

  async deleteByMessage(guildId: string, messageId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM reaction_roles WHERE guild_id = ? AND message_id = ?')
      .run(guildId, messageId);
  }

  async deleteByMessageAndEmoji(guildId: string, messageId: string, emoji: string): Promise<void> {
    this.db
      .prepare('DELETE FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND emoji = ?')
      .run(guildId, messageId, emoji);
  }

  async getAllBindings(platform?: string): Promise<ReactionRoleBinding[]> {
    let rows: Record<string, unknown>[];
    if (platform) {
      rows = this.db
        .prepare(
          'SELECT * FROM reaction_roles WHERE platform = ? ORDER BY guild_id, created_at ASC'
        )
        .all(platform) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare('SELECT * FROM reaction_roles ORDER BY guild_id, created_at ASC')
        .all() as Record<string, unknown>[];
    }

    return rows.map((row) => this.rowToBinding(row));
  }

  async getAllGuildIds(): Promise<string[]> {
    const rows = this.db.prepare('SELECT DISTINCT guild_id FROM reaction_roles').all() as {
      guild_id: string;
    }[];

    return rows.map((row) => row.guild_id);
  }

  private rowToBinding(row: Record<string, unknown>): ReactionRoleBinding {
    return {
      id: row.id as number,
      guildId: row.guild_id as string,
      messageId: row.message_id as string,
      emoji: row.emoji as string,
      roleId: row.role_id as string,
      platform: row.platform as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reaction_roles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id    TEXT NOT NULL,
        message_id  TEXT NOT NULL,
        emoji       TEXT NOT NULL,
        role_id     TEXT NOT NULL,
        platform    TEXT NOT NULL DEFAULT 'discord',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(guild_id, message_id, emoji)
      )
    `);

    // Add platform column to existing tables (safe to run repeatedly)
    try {
      this.db.exec(
        `ALTER TABLE reaction_roles ADD COLUMN platform TEXT NOT NULL DEFAULT 'discord'`
      );
    } catch {
      // Column already exists — ignore
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reaction_roles_lookup
      ON reaction_roles (guild_id, message_id, emoji)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reaction_roles_guild
      ON reaction_roles (guild_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reaction_roles_message
      ON reaction_roles (message_id)
    `);
  }
}
