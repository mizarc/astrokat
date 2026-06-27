/**
 * A single point-in-time snapshot of guild count and total members.
 */
export interface GuildSnapshot {
  guildCount: number;
  memberTotal: number;
  recordedAt: number; // Unix timestamp (seconds)
}

/**
 * Abstract storage interface for guild snapshots.
 */
export interface GuildSnapshotStore {
  /** Persist a new snapshot row. */
  record(snapshot: GuildSnapshot): Promise<void>;

  /**
   * Load the most recent snapshots, newest first.
   * @param limit Max rows to return. Defaults to 100.
   */
  getHistory(limit?: number): Promise<GuildSnapshot[]>;
}
