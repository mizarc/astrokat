import type { GuildFeatureStore } from './guildFeatureStore.js';
import { SqliteGuildFeatureStore } from './guildFeatureStoreSqlite.js';
import { PostgresGuildFeatureStore } from './guildFeatureStorePostgres.js';

class GuildFeatureService {
  private readonly store: GuildFeatureStore;

  constructor(store: GuildFeatureStore) {
    this.store = store;
  }

  async isEnabled(guildId: string, feature: string): Promise<boolean> {
    return this.store.isEnabled(guildId, feature);
  }

  async set(guildId: string, feature: string, enabled: boolean): Promise<void> {
    return this.store.set(guildId, feature, enabled);
  }

  async getAll(guildId: string): Promise<Record<string, boolean>> {
    return this.store.getAll(guildId);
  }
}

const store = process.env.DATABASE_URL
  ? new PostgresGuildFeatureStore()
  : new SqliteGuildFeatureStore();

export const guildFeatureService = new GuildFeatureService(store);
