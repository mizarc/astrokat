import type { GuildDisabledCommandStore } from './guildDisabledCommandStore.js';
import { SqliteGuildDisabledCommandStore } from './guildDisabledCommandStoreSqlite.js';
import { PostgresGuildDisabledCommandStore } from './guildDisabledCommandStorePostgres.js';

class GuildDisabledCommandService {
  private readonly store: GuildDisabledCommandStore;

  constructor(store: GuildDisabledCommandStore) {
    this.store = store;
  }

  async isDisabled(guildId: string, commandName: string): Promise<boolean> {
    return this.store.isDisabled(guildId, commandName);
  }

  async getAll(guildId: string): Promise<string[]> {
    return this.store.getAll(guildId);
  }

  async add(guildId: string, commandName: string): Promise<void> {
    return this.store.add(guildId, commandName);
  }

  async remove(guildId: string, commandName: string): Promise<void> {
    return this.store.remove(guildId, commandName);
  }
}

const store = process.env.DATABASE_URL
  ? new PostgresGuildDisabledCommandStore()
  : new SqliteGuildDisabledCommandStore();

export const guildDisabledCommandService = new GuildDisabledCommandService(store);
