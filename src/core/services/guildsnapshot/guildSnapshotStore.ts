/**
 * A single point-in-time snapshot of guild count and total members.
 */
export interface GuildSnapshot {
  guildCount: number;
  memberTotal: number;
  recordedAt: number; // Unix timestamp (seconds)
  platform: string; // e.g. 'discord' | 'fluxer'
}

/**
 * Abstract storage interface for guild snapshots.
 */
export interface GuildSnapshotStore {
  /** Persist a new snapshot row. */
  record(snapshot: GuildSnapshot): Promise<void>;

  /**
   * Load snapshots from a point in time until now, newest first.
   * @param since     Optional Unix timestamp — only rows >= this time.
   * @param platform  Optional platform filter (e.g. 'discord', 'fluxer').
   */
  getHistory(since?: number, platform?: string): Promise<GuildSnapshot[]>;
}

// Lazy singleton — constructed once, reused across commands and services.
let _store: GuildSnapshotStore | null = null;
let _storePromise: Promise<GuildSnapshotStore> | null = null;

/**
 * Returns the shared snapshot store instance.
 * Automatically selects SQLite or Postgres based on DATABASE_URL.
 */
export async function getSnapshotStore(): Promise<GuildSnapshotStore> {
  if (_store) return _store;
  if (_storePromise) return _storePromise;

  _storePromise = (async () => {
    const { SqliteGuildSnapshotStore } = await import('./guildSnapshotStoreSqlite.js');
    const { PostgresGuildSnapshotStore } = await import('./guildSnapshotStorePostgres.js');

    _store = process.env.DATABASE_URL
      ? new PostgresGuildSnapshotStore()
      : new SqliteGuildSnapshotStore();
    return _store;
  })();

  return _storePromise;
}
