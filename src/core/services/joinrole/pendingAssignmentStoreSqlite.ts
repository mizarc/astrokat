import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type {
  PendingAssignmentStore,
  PendingRoleAssignment,
  PendingAssignmentCreate,
} from './pendingAssignmentStore.js';

export interface SqlitePendingAssignmentStoreOptions {
  /** Path to the SQLite database file. Defaults to `data/astrokat.db`. */
  dbPath?: string;
}

/**
 * SQLite-backed pending role assignment store.
 */
export class SqlitePendingAssignmentStore implements PendingAssignmentStore {
  private readonly db: Database.Database;

  constructor(options?: SqlitePendingAssignmentStoreOptions) {
    const dbPath = options?.dbPath ?? resolve('data', 'astrokat.db');

    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureTable();
  }

  async create(assignment: PendingAssignmentCreate): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO pending_role_assignments (guild_id, user_id, role_id, platform, due_at)
      VALUES (@guildId, @userId, @roleId, @platform, @dueAt)
    `);

    const result = stmt.run({
      guildId: assignment.guildId,
      userId: assignment.userId,
      roleId: assignment.roleId,
      platform: assignment.platform,
      dueAt: assignment.dueAt,
    });

    return Number(result.lastInsertRowid);
  }

  async getDue(now: number, limit?: number): Promise<PendingRoleAssignment[]> {
    let query = 'SELECT * FROM pending_role_assignments WHERE due_at <= ? ORDER BY due_at ASC';
    const params: unknown[] = [now];

    if (limit !== undefined) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this.db.prepare(query).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.rowToAssignment(row));
  }

  async deletePending(guildId: string, userId: string, roleId: string): Promise<void> {
    this.db
      .prepare(
        'DELETE FROM pending_role_assignments WHERE guild_id = ? AND user_id = ? AND role_id = ?'
      )
      .run(guildId, userId, roleId);
  }

  async deletePendingByUser(guildId: string, userId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM pending_role_assignments WHERE guild_id = ? AND user_id = ?')
      .run(guildId, userId);
  }

  async getAllPending(): Promise<PendingRoleAssignment[]> {
    const rows = this.db
      .prepare('SELECT * FROM pending_role_assignments ORDER BY due_at ASC')
      .all() as Record<string, unknown>[];

    return rows.map((row) => this.rowToAssignment(row));
  }

  private rowToAssignment(row: Record<string, unknown>): PendingRoleAssignment {
    return {
      id: row.id as number,
      guildId: row.guild_id as string,
      userId: row.user_id as string,
      roleId: row.role_id as string,
      platform: row.platform as string,
      dueAt: row.due_at as number,
      createdAt: row.created_at as string,
    };
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_role_assignments (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id     TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        role_id      TEXT NOT NULL,
        platform     TEXT NOT NULL DEFAULT 'discord',
        due_at       INTEGER NOT NULL,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
}
