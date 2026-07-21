import pg from 'pg';
import type { GuildFeatureStore } from './guildFeatureStore.js';

const { Pool } = pg;

export interface PostgresGuildFeatureStoreOptions {
  connectionString?: string;
  max?: number;
}

export class PostgresGuildFeatureStore implements GuildFeatureStore {
  private readonly pool: pg.Pool;

  constructor(options?: PostgresGuildFeatureStoreOptions) {
    this.pool = new Pool({
      connectionString: options?.connectionString ?? process.env.DATABASE_URL,
      max: options?.max ?? 5,
    });
    this.ensureTable();
  }

  async isEnabled(guildId: string, feature: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT enabled FROM disabled_features WHERE guild_id = $1 AND feature = $2',
      [guildId, feature]
    );
    if (result.rows.length === 0) return true; // default true (opt-out)
    return result.rows[0].enabled;
  }

  async set(guildId: string, feature: string, enabled: boolean): Promise<void> {
    await this.pool.query(
      `INSERT INTO disabled_features (guild_id, feature, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, feature) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [guildId, feature, enabled]
    );
  }

  async getAll(guildId: string): Promise<Record<string, boolean>> {
    const result = await this.pool.query(
      'SELECT feature, enabled FROM disabled_features WHERE guild_id = $1',
      [guildId]
    );
    const map: Record<string, boolean> = {};
    for (const row of result.rows) {
      map[row.feature] = row.enabled;
    }
    return map;
  }

  private async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS disabled_features (
        guild_id TEXT NOT NULL,
        feature  TEXT NOT NULL,
        enabled  BOOLEAN NOT NULL DEFAULT true,
        PRIMARY KEY (guild_id, feature)
      )
    `);
  }
}
