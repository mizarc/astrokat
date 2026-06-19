import type { GuildConfigStore, GuildConfig } from './guildConfigStore.js';
import { SqliteGuildConfigStore } from './guildConfigStoreSqlite.js';
import { PostgresGuildConfigStore } from './guildConfigStorePostgres.js';

/**
 * Service layer for guild-level configuration management.
 *
 * Wraps a `GuildConfigStore` implementation, keeping commands
 * agnostic to the storage backend (SQLite vs PostgreSQL).
 *
 * The backend is auto-selected at module load time:
 * - `DATABASE_URL` set -> PostgreSQL
 * - Otherwise -> SQLite
 */
class GuildConfigService {
  private readonly persistence: GuildConfigStore;

  /**
   * @param store - The storage backend to use.
   */
  constructor(store: GuildConfigStore) {
    this.persistence = store;
  }

  /**
   * Delegates to {@link GuildConfigStore#get}.
   *
   * @param guildId - Identifies which guild to look up.
   */
  async get(guildId: string): Promise<GuildConfig> {
    return this.persistence.get(guildId);
  }

  /**
   * Delegates to {@link GuildConfigStore#set}.
   *
   * @param guildId - Identifies which guild to update.
   * @param config  - Partial config with the fields to update.
   */
  async set(guildId: string, config: Partial<GuildConfig>): Promise<void> {
    return this.persistence.set(guildId, config);
  }
}

// Backend auto-selection
// No DATABASE_URL -> SQLite
// DATABASE_URL set -> PostgreSQL
const store = process.env.DATABASE_URL
  ? new PostgresGuildConfigStore()
  : new SqliteGuildConfigStore();

console.log('[GUILD-CONFIG] Using', process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite', 'backend.');

/** Application-wide singleton. Import this rather than constructing a new instance. */
export const guildConfigService = new GuildConfigService(store);
