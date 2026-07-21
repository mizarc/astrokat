import pg from 'pg';
import type {
  PendingAssignmentStore,
  PendingRoleAssignment,
  PendingAssignmentCreate,
} from './pendingAssignmentStore.js';

const { Pool } = pg;

export interface PostgresPendingAssignmentStoreOptions {
  /** PostgreSQL connection string. Defaults to `DATABASE_URL` env var. */
  connectionString?: string;
  /** Max number of clients in the pool. Defaults to 5. */
  max?: number;
}

/**
 * PostgreSQL-backed pending role assignment store.
 */
export class PostgresPendingAssignmentStore implements PendingAssignmentStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresPendingAssignmentStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });

    this.ensureTable();
  }

  async create(assignment: PendingAssignmentCreate): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO role_join_queue (guild_id, user_id, role_id, platform, due_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        assignment.guildId,
        assignment.userId,
        assignment.roleId,
        assignment.platform,
        assignment.dueAt,
      ]
    );

    return result.rows[0].id as number;
  }

  async getDue(now: number, limit?: number): Promise<PendingRoleAssignment[]> {
    let query = 'SELECT * FROM role_join_queue WHERE due_at <= $1 ORDER BY due_at ASC';
    const params: unknown[] = [now];

    if (limit !== undefined) {
      query += ' LIMIT $2';
      params.push(limit);
    }

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.rowToAssignment(row));
  }

  async deletePending(guildId: string, userId: string, roleId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM role_join_queue WHERE guild_id = $1 AND user_id = $2 AND role_id = $3',
      [guildId, userId, roleId]
    );
  }

  async deletePendingByUser(guildId: string, userId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM role_join_queue WHERE guild_id = $1 AND user_id = $2',
      [guildId, userId]
    );
  }

  async getAllPending(): Promise<PendingRoleAssignment[]> {
    const result = await this.pool.query(
      'SELECT * FROM role_join_queue ORDER BY due_at ASC'
    );

    return result.rows.map((row) => this.rowToAssignment(row));
  }

  async close(): Promise<void> {
    await this.pool.end();
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

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS role_join_queue (
        id           SERIAL PRIMARY KEY,
        guild_id     TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        role_id      TEXT NOT NULL,
        platform     TEXT NOT NULL DEFAULT 'discord',
        due_at       INTEGER NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
}
