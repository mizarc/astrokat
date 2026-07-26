/**
 * Abstract storage interface for global bot-level configuration.
 *
 * Stores a single row per platform with fixed columns for the bot's
 * custom status text and presence. When `platform` is an empty string
 * the setting applies to all platforms (used as a fallback).
 */

/** Sentinel value used for the "all platforms" row. */
export const PLATFORM_ALL = '';

export interface BotConfigRow {
  /**
   * Platform this config row belongs to.
   * - `'discord'` -> Discord only
   * - `'fluxer'` -> Fluxer only
   * - `''` -> all platforms (fallback)
   */
  platform: string;

  /** Custom status text (e.g. "with cats"). `null` / empty if unset. */
  statusText: string | null;

  /** Emoji name (Unicode char, shortcode, or custom name). */
  statusEmojiName: string | null;

  /** Custom emoji ID (only meaningful for Discord custom emojis). */
  statusEmojiId: string | null;

  /** Bot presence: `'online'`, `'idle'`, `'dnd'`, `'invisible'`. */
  presence: string | null;
}

export interface BotConfigStore {
  /**
   * Retrieve the config row for a specific platform.
   *
   * @param platform - Platform identifier. Pass `''` for the global row.
   */
  get(platform: string): Promise<BotConfigRow | null>;

  /**
   * Retrieve the most relevant config row for a given platform.
   *
   * Tries the platform-specific row first, then falls back to the
   * global (all-platforms) row.
   *
   * @param platform - Platform to look up (e.g. `'discord'`).
   */
  getForPlatform(platform: string): Promise<BotConfigRow | null>;

  /**
   * Upsert the config row for a platform.
   *
   * @param platform - Platform identifier. Pass `''` to apply to all platforms.
   * @param row - Partial row with the fields to update.
   */
  set(platform: string, row: Partial<BotConfigRow>): Promise<void>;
}
