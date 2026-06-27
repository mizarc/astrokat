export interface RepEntry {
  guildId: string;
  userId: string;
  platform: 'discord' | 'fluxer';
  rep: number;
  updatedAt: number;
}

/**
 * Abstract storage interface for the reputation system.
 *
 * The system uses two separate tracking layers:
 * - Permanent Ledger: tracks lifetime total rep (only goes up).
 * - Temporary Lockouts: time-based restrictions that auto-expire.
 */
export interface RepStore {
  /** Get a single user's rep entry. Returns null if they have no rep yet. */
  getEntry(guildId: string, userId: string): Promise<RepEntry | null>;

  /** Atomically increment a user's lifetime rep by 1. Creates entry if none exists. */
  addRepPoint(guildId: string, userId: string, platform: 'discord' | 'fluxer'): Promise<void>;

  /** Get the top N users in a guild, ordered by rep descending. */
  getLeaderboard(guildId: string, limit: number, offset: number): Promise<RepEntry[]>;

  /** Get a user's rank (1-based) within their guild, or null if no rep. */
  getUserRank(guildId: string, userId: string): Promise<number | null>;

  /** Get total number of users with rep entries in a guild. */
  getMemberCount(guildId: string): Promise<number>;

  /**
   * Log that the giver has consumed one of their daily rep tokens.
   * Records a timestamped row used to count activity in the last 24 hours.
   */
  recordDailyAllowance(guildId: string, giverId: string): Promise<void>;

  /**
   * Count how many rep tokens the giver has used in the last 24 hours.
   */
  getDailyAllowanceCount(guildId: string, giverId: string): Promise<number>;

  /**
   * Record or update the timestamp of when a giver last repped a receiver.
   * Used to enforce the 7-day lockout between the same pair.
   */
  recordTargetLockout(guildId: string, giverId: string, receiverId: string): Promise<void>;

  /**
   * Check whether the giver has repped this specific receiver within the last 7 days.
   * Returns true if the lockout is still active.
   */
  hasActiveTargetLockout(guildId: string, giverId: string, receiverId: string): Promise<boolean>;
}
