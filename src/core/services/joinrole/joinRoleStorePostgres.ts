import pg from 'pg';
import type { JoinRoleStore, JoinRoleBinding, JoinRoleCreate } from './joinRoleStore.js';

const { Pool } = pg;

export interface PostgresJoinRoleStoreOptions {
  /** PostgreSQL connection string. Defaults to `DATABASE_URL` env var. */
  connectionString?: string;
  /** Max number of clients in the pool. Defaults to 5. */
  max?: number;
}

/**
 * PostgreSQL-backed join-role store.
 */
export class PostgresJoinRoleStore implements JoinRoleStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresJoinRoleStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });

    this.ensureTable();
  }

  async create(binding: JoinRoleCreate): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO join_roles (guild_id, role_id, platform, min_account_age_minutes, min_member_age_minutes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        binding.guildId,
        binding.roleId,
        binding.platform,
        binding.minAccountAgeMinutes ?? null,
        binding.minMemberAgeMinutes ?? null,
      ]
    );

    return result.rows[0].id as number;
  }

  async getByGuild(guildId: string): Promise<JoinRoleBinding[]> {
    const result = await this.pool.query(
      'SELECT * FROM join_roles WHERE guild_id = $1 ORDER BY created_at ASC',
      [guildId]
    );

    return result.rows.map((row) => this.rowToBinding(row));
  }

  async getById(id: number): Promise<JoinRoleBinding | null> {
    const result = await this.pool.query('SELECT * FROM join_roles WHERE id = $1', [id]);

    if (result.rows.length === 0) return null;
    return this.rowToBinding(result.rows[0]);
  }

  async getByGuildAndRole(guildId: string, roleId: string): Promise<JoinRoleBinding | null> {
    const result = await this.pool.query(
      'SELECT * FROM join_roles WHERE guild_id = $1 AND role_id = $2',
      [guildId, roleId]
    );

    if (result.rows.length === 0) return null;
    return this.rowToBinding(result.rows[0]);
  }

  async delete(id: number): Promise<void> {
    await this.pool.query('DELETE FROM join_roles WHERE id = $1', [id]);
  }

  async deleteByGuildAndRole(guildId: string, roleId: string): Promise<void> {
    await this.pool.query('DELETE FROM join_roles WHERE guild_id = $1 AND role_id = $2', [
      guildId,
      roleId,
    ]);
  }

  async getAllBindings(): Promise<JoinRoleBinding[]> {
    const result = await this.pool.query(
      'SELECT * FROM join_roles ORDER BY guild_id, created_at ASC'
    );

    return result.rows.map((row) => this.rowToBinding(row));
  }

  async getAllGuildIds(): Promise<string[]> {
    const result = await this.pool.query('SELECT DISTINCT guild_id FROM join_roles');

    return result.rows.map((row) => row.guild_id as string);
  }

  async close(): Promise<void> {
    await this.pool.end();
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

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS join_roles (
        id                      SERIAL PRIMARY KEY,
        guild_id                TEXT NOT NULL,
        role_id                 TEXT NOT NULL,
        platform                TEXT NOT NULL DEFAULT 'discord',
        min_account_age_minutes INTEGER,
        min_member_age_minutes  INTEGER,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(guild_id, role_id)
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_join_roles_guild
      ON join_roles (guild_id)
    `);
  }
}
