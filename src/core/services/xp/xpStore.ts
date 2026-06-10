export interface XPEntry {
  guildId: string;
  userId: string;
  platform: 'discord' | 'fluxer';
  xp: number;
  level: number;
  /** Unix timestamp of the last XP-granting action (cooldown enforcement). */
  lastActionAt: number;
  updatedAt: number;
}

/**
 * Abstract storage interface for XP / levelling data.
 */
export interface XPStore {
  /** Get a single user's XP entry. Returns null if they have no XP yet. */
  getEntry(guildId: string, userId: string): Promise<XPEntry | null>;

  /** Create or update a user's XP entry. */
  upsertEntry(entry: XPEntry): Promise<void>;

  /** Get the top N users in a guild, ordered by XP descending. */
  getLeaderboard(guildId: string, limit: number, offset: number): Promise<XPEntry[]>;

  /** Get a user's rank (1-based) within their guild, or null if no XP. */
  getUserRank(guildId: string, userId: string): Promise<number | null>;

  /** Get total number of users with XP entries in a guild. */
  getMemberCount(guildId: string): Promise<number>;
}
