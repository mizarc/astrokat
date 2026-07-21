import pg from 'pg';
import type { LevelRoleStore, LevelRoleBinding, LevelRoleCreate } from './levelRoleStore.js';

const { Pool } = pg;

export interface PostgresLevelRoleStoreOptions {
  /** PostgreSQL connection string. Defaults to `DATABASE_URL` env var. */
  connectionString?: string;
  /** Max number of clients in the pool. Defaults to 5. */
  max?: number;
}

/**
 * PostgreSQL-backed level-role store.
 */
export class PostgresLevelRoleStore implements LevelRoleStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresLevelRoleStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });

    this.ensureTable();
  }

  async create(binding: LevelRoleCreate): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO level_roles (guild_id, role_id, level, platform)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [binding.guildId, binding.roleId, binding.level, binding.platform]
    );

    return result.rows[0].id as number;
  }

  async getByGuild(guildId: string): Promise<LevelRoleBinding[]> {
    const result = await this.pool.query(
      'SELECT * FROM level_roles WHERE guild_id = $1 ORDER BY level ASC',
      [guildId]
    );

    return result.rows.map((row) => this.rowToBinding(row));
  }

  async getById(id: number): Promise<LevelRoleBinding | null> {
    const result = await this.pool.query('SELECT * FROM level_roles WHERE id = $1', [id]);

    if (result.rows.length === 0) return null;
    return this.rowToBinding(result.rows[0]);
  }

  async getByGuildAndLevel(guildId: string, level: number): Promise<LevelRoleBinding | null> {
    const result = await this.pool.query(
      'SELECT * FROM level_roles WHERE guild_id = $1 AND level = $2',
      [guildId, level]
    );

    if (result.rows.length === 0) return null;
    return this.rowToBinding(result.rows[0]);
  }

  async getByGuildAndRole(guildId: string, roleId: string): Promise<LevelRoleBinding | null> {
    const result = await this.pool.query(
      'SELECT * FROM level_roles WHERE guild_id = $1 AND role_id = $2',
      [guildId, roleId]
    );

    if (result.rows.length === 0) return null;
    return this.rowToBinding(result.rows[0]);
  }

  async getHighestForGuildUpToLevel(
    guildId: string,
    userLevel: number
  ): Promise<LevelRoleBinding | null> {
    const result = await this.pool.query(
      'SELECT * FROM level_roles WHERE guild_id = $1 AND level <= $2 ORDER BY level DESC LIMIT 1',
      [guildId, userLevel]
    );

    if (result.rows.length === 0) return null;
    return this.rowToBinding(result.rows[0]);
  }

  async delete(id: number): Promise<void> {
    await this.pool.query('DELETE FROM level_roles WHERE id = $1', [id]);
  }

  async deleteByGuildAndRole(guildId: string, roleId: string): Promise<void> {
    await this.pool.query('DELETE FROM level_roles WHERE guild_id = $1 AND role_id = $2', [
      guildId,
      roleId,
    ]);
  }

  async deleteByGuild(guildId: string): Promise<void> {
    await this.pool.query('DELETE FROM level_roles WHERE guild_id = $1', [guildId]);
  }

  async getAllBindings(): Promise<LevelRoleBinding[]> {
    const result = await this.pool.query('SELECT * FROM level_roles ORDER BY guild_id, level ASC');

    return result.rows.map((row) => this.rowToBinding(row));
  }

  async getAllGuildIds(): Promise<string[]> {
    const result = await this.pool.query('SELECT DISTINCT guild_id FROM level_roles');

    return result.rows.map((row) => row.guild_id as string);
  }

  async close(): Promise<void> {
    await this.pool.end();
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

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS level_roles (
        id           SERIAL PRIMARY KEY,
        guild_id     TEXT NOT NULL,
        role_id      TEXT NOT NULL,
        level        INTEGER NOT NULL,
        platform     TEXT NOT NULL DEFAULT 'discord',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(guild_id, level)
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_level_roles_guild
      ON level_roles (guild_id)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_level_roles_guild_level
      ON level_roles (guild_id, level)
    `);
  }
}
