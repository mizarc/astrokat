/**
 * Abstract storage interface for guild-level feature toggles.
 *
 * Features are simple key-value booleans (e.g. xpEnabled, repEnabled).
 * This avoids ALTER TABLE migrations when adding new toggles.
 */
export interface GuildFeatureStore {
  /**
   * Check if a feature is enabled for a guild.
   * Returns `true` by default when no row exists (features opt-out).
   */
  isEnabled(guildId: string, feature: string): Promise<boolean>;

  /**
   * Enable or disable a feature for a guild.
   */
  set(guildId: string, feature: string, enabled: boolean): Promise<void>;

  /**
   * Get all feature toggles for a guild as a flat map.
   */
  getAll(guildId: string): Promise<Record<string, boolean>>;
}
