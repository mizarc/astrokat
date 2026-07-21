import pg from 'pg';
import type { GuildDisabledCommandStore } from './guildDisabledCommandStore.js';

const { Pool } = pg;

export interface PostgresGuildDisabledCommandStoreOptions {
  connectionString?: string;
  max?: number;
}

export class PostgresGuildDisabledCommandStore implements GuildDisabledCommandStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresGuildDisabledCommandStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });
    this.ensureTable();
  }

  async isDisabled(guildId: string, commandName: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM disabled_commands WHERE guild_id = $1 AND command_name = $2',
      [guildId, commandName]
    );
    return result.rows.length > 0;
  }

  async getAll(guildId: string): Promise<string[]> {
    const result = await this.pool.query(
      'SELECT command_name FROM disabled_commands WHERE guild_id = $1 ORDER BY command_name',
      [guildId]
    );
    return result.rows.map((r: { command_name: string }) => r.command_name);
  }

  async add(guildId: string, commandName: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO disabled_commands (guild_id, command_name)
       VALUES ($1, $2)
       ON CONFLICT (guild_id, command_name) DO NOTHING`,
      [guildId, commandName]
    );
  }

  async remove(guildId: string, commandName: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM disabled_commands WHERE guild_id = $1 AND command_name = $2',
      [guildId, commandName]
    );
  }

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS disabled_commands (
        guild_id     TEXT NOT NULL,
        command_name TEXT NOT NULL,
        PRIMARY KEY (guild_id, command_name)
      )
    `);
  }
}
