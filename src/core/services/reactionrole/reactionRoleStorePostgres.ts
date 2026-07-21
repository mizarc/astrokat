import pg from 'pg';
import type {
  ReactionRoleStore,
  ReactionRoleBinding,
  ReactionRoleCreate,
} from './reactionRoleStore.js';

const { Pool } = pg;

export interface PostgresReactionRoleStoreOptions {
  /** PostgreSQL connection string. Defaults to `DATABASE_URL` env var. */
  connectionString?: string;
  /** Max number of clients in the pool. Defaults to 5. */
  max?: number;
}

/**
 * PostgreSQL-backed reaction role store.
 */
export class PostgresReactionRoleStore implements ReactionRoleStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresReactionRoleStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });

    this.ensureTable();
  }

  async create(binding: ReactionRoleCreate): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO reaction_roles (guild_id, message_id, emoji, role_id, platform)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [binding.guildId, binding.messageId, binding.emoji, binding.roleId, binding.platform]
    );

    return result.rows[0].id as number;
  }

  async getByGuild(guildId: string): Promise<ReactionRoleBinding[]> {
    const result = await this.pool.query(
      'SELECT * FROM reaction_roles WHERE guild_id = $1 ORDER BY created_at ASC',
      [guildId]
    );

    return result.rows.map((row) => this.rowToBinding(row));
  }

  async getByMessage(guildId: string, messageId: string): Promise<ReactionRoleBinding[]> {
    const result = await this.pool.query(
      'SELECT * FROM reaction_roles WHERE guild_id = $1 AND message_id = $2 ORDER BY created_at ASC',
      [guildId, messageId]
    );

    return result.rows.map((row) => this.rowToBinding(row));
  }

  async getById(id: number): Promise<ReactionRoleBinding | null> {
    const result = await this.pool.query('SELECT * FROM reaction_roles WHERE id = $1', [id]);

    if (result.rows.length === 0) return null;
    return this.rowToBinding(result.rows[0]);
  }

  async getByMessageAndEmoji(
    guildId: string,
    messageId: string,
    emoji: string
  ): Promise<ReactionRoleBinding | null> {
    const result = await this.pool.query(
      'SELECT * FROM reaction_roles WHERE guild_id = $1 AND message_id = $2 AND emoji = $3',
      [guildId, messageId, emoji]
    );

    if (result.rows.length === 0) return null;
    return this.rowToBinding(result.rows[0]);
  }

  async delete(id: number): Promise<void> {
    await this.pool.query('DELETE FROM reaction_roles WHERE id = $1', [id]);
  }

  async deleteByMessage(guildId: string, messageId: string): Promise<void> {
    await this.pool.query('DELETE FROM reaction_roles WHERE guild_id = $1 AND message_id = $2', [
      guildId,
      messageId,
    ]);
  }

  async deleteByMessageAndEmoji(guildId: string, messageId: string, emoji: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM reaction_roles WHERE guild_id = $1 AND message_id = $2 AND emoji = $3',
      [guildId, messageId, emoji]
    );
  }

  async deleteByGuild(guildId: string): Promise<void> {
    await this.pool.query('DELETE FROM reaction_roles WHERE guild_id = $1', [guildId]);
  }

  async getAllBindings(platform?: string): Promise<ReactionRoleBinding[]> {
    let result;
    if (platform) {
      result = await this.pool.query(
        'SELECT * FROM reaction_roles WHERE platform = $1 ORDER BY guild_id, created_at ASC',
        [platform]
      );
    } else {
      result = await this.pool.query(
        'SELECT * FROM reaction_roles ORDER BY guild_id, created_at ASC'
      );
    }

    return result.rows.map((row) => this.rowToBinding(row));
  }

  async getAllGuildIds(): Promise<string[]> {
    const result = await this.pool.query('SELECT DISTINCT guild_id FROM reaction_roles');

    return result.rows.map((row) => row.guild_id as string);
  }

  async close(): Promise<void> {
    await this.pool.end();
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

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reaction_roles (
        id          SERIAL PRIMARY KEY,
        guild_id    TEXT NOT NULL,
        message_id  TEXT NOT NULL,
        emoji       TEXT NOT NULL,
        role_id     TEXT NOT NULL,
        platform    TEXT NOT NULL DEFAULT 'discord',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(guild_id, message_id, emoji)
      )
    `);

    // Add platform column to existing tables
    await this.pool.query(`
      ALTER TABLE reaction_roles ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'discord'
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reaction_roles_lookup
      ON reaction_roles (guild_id, message_id, emoji)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reaction_roles_guild
      ON reaction_roles (guild_id)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reaction_roles_message
      ON reaction_roles (message_id)
    `);
  }
}
