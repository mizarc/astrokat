/**
 * Abstract storage interface for guild-level disabled commands.
 *
 * Only commands that are explicitly disabled have rows in this table.
 * An empty result set means all commands are enabled.
 */
export interface GuildDisabledCommandStore {
  /**
   * Check if a command is disabled for a guild.
   */
  isDisabled(guildId: string, commandName: string): Promise<boolean>;

  /**
   * Get all disabled commands for a guild.
   */
  getAll(guildId: string): Promise<string[]>;

  /**
   * Disable a command in a guild. No-op if already disabled.
   */
  add(guildId: string, commandName: string): Promise<void>;

  /**
   * Re-enable a command in a guild. No-op if already enabled.
   */
  remove(guildId: string, commandName: string): Promise<void>;
}
