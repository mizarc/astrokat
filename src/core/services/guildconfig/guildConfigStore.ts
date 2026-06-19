/** Guild-level configuration persisted in the database. */
export interface GuildConfig {
  /** Identifies which guild this config belongs to. */
  guildId: string;

  /**
   * Max commands a single user may issue within the rate limit window.
   * `null` means no per-user override — use the environment default.
   */
  rateLimitUserMax: number | null;

  /**
   * Max commands the entire guild may issue within the rate limit window.
   * `null` means no per-guild override — use the environment default.
   */
  rateLimitGuildMax: number | null;

  /** 
   * Whether level-up messages are sent in the guild. Defaults to false. 
   * */
  levelUpMessages: boolean;
}

/**
 * Abstract storage interface for guild-level configuration.
 */
export interface GuildConfigStore {
  /**
   * Retrieves the full configuration for a guild.
   *
   * When no custom config has been persisted, the returned object
   * contains defaults: `null` rate limits and `false` for level-up
   * messages.
   *
   * @param guildId - Identifies which guild to look up.
   */
  get(guildId: string): Promise<GuildConfig>;

  /**
   * Persists configuration changes for a guild.
   *
   * Accepts a partial config — only the supplied fields are
   * written. Omitted fields remain unchanged. Set a rate limit
   * field to `null` to clear its override and restore the default.
   *
   * @param guildId - Identifies which guild to update.
   * @param config  - Partial config with the fields to update.
   */
  set(guildId: string, config: Partial<GuildConfig>): Promise<void>;
}
