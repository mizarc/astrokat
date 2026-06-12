export interface XPEntry {
  guildId: string;
  userId: string;
  platform: 'discord' | 'fluxer';
  xp: number;
  level: number;
  /** Unix timestamp of the last XP-granting action (cooldown enforcement). */
  lastActionAt: number;
  updatedAt: number;
  /** Whether this user wants level-up notifications. Defaults to true when not set. */
  xpNotifications?: boolean;
}

/** Guild-level XP configuration. */
export interface GuildConfig {
  guildId: string;
  /** Whether level-up messages are sent in the guild. Defaults to true when not set. */
  levelUpMessages: boolean;
}

/** A keyword-triggered XP bonus configured by a guild admin. */
export interface KeywordBonus {
  guildId: string;
  keyword: string;
  xpAmount: number;
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

  /** Get guild-level XP configuration. Returns defaults if not set. */
  getGuildConfig(guildId: string): Promise<GuildConfig>;

  /** Update guild-level XP configuration. */
  setGuildConfig(guildId: string, config: Partial<GuildConfig>): Promise<void>;

  /** Toggle a user's level-up notification preference. */
  setXpNotifications(guildId: string, userId: string, enabled: boolean): Promise<void>;

  // ── Keyword bonuses ──────────────────────────────────────────────────────

  /** Get the bonus XP for a keyword in a guild, or null if not configured. */
  getKeywordBonus(guildId: string, keyword: string): Promise<number | null>;

  /** Set a keyword bonus. Overwrites if the same keyword already exists. */
  setKeywordBonus(guildId: string, keyword: string, xpAmount: number): Promise<void>;

  /** Remove a keyword bonus. No-op if it doesn't exist. */
  removeKeywordBonus(guildId: string, keyword: string): Promise<void>;

  /** List all keyword bonuses configured for a guild. */
  listKeywordBonuses(guildId: string): Promise<KeywordBonus[]>;
}
