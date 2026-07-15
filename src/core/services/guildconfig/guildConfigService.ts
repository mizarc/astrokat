import type { GuildConfigStore, GuildConfig } from './guildConfigStore.js';
import { SqliteGuildConfigStore } from './guildConfigStoreSqlite.js';
import { PostgresGuildConfigStore } from './guildConfigStorePostgres.js';

/**
 * Service layer for guild-level configuration management.
 *
 * Wraps a `GuildConfigStore` implementation, keeping commands
 * agnostic to the storage backend (SQLite vs PostgreSQL).
 *
 * The store is lazily created on the first `get()` or `set()` call:
 * - `DATABASE_URL` set -> PostgreSQL
 * - Otherwise -> SQLite
 *
 * This avoids opening the database at module load time, which would
 * crash in environments where the `data/` directory doesn't exist
 * (e.g. CI runners with a fresh checkout).
 */
class GuildConfigService {
  private _persistence: GuildConfigStore | null = null;

  private get persistence(): GuildConfigStore {
    if (!this._persistence) {
      this._persistence = process.env.DATABASE_URL
        ? new PostgresGuildConfigStore()
        : new SqliteGuildConfigStore();
      console.log(
        '[GUILD-CONFIG] Using',
        process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite',
        'backend.'
      );
    }
    return this._persistence;
  }

  /**
   * Retrieves the full configuration for a guild.
   *
   * @param guildId - Identifies which guild to look up.
   */
  async get(guildId: string): Promise<GuildConfig> {
    return this.persistence.get(guildId);
  }

  /**
   * Persists configuration changes for a guild.
   *
   * @param guildId - Identifies which guild to update.
   * @param config  - Partial config with the fields to update.
   */
  async set(guildId: string, config: Partial<GuildConfig>): Promise<void> {
    return this.persistence.set(guildId, config);
  }
}

/** Application-wide singleton. Import this rather than constructing a new instance. */
export const guildConfigService = new GuildConfigService();
