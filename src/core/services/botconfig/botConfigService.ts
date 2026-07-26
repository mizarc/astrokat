import type { BotConfigStore, BotConfigRow } from './botConfigStore.js';
import { SqliteBotConfigStore } from './botConfigStoreSqlite.js';
import { PostgresBotConfigStore } from './botConfigStorePostgres.js';

/**
 * Persisted bot status & presence snapshot.
 * Returned by {@link BotConfigService.loadStatusAndPresence}.
 */
export interface BotStatusSnapshot {
  statusText: string | null;
  statusEmojiName: string | null;
  statusEmojiId: string | null;
  presence: string | null;
}

/**
 * Service layer for global bot-level configuration.
 *
 * Persists and restores the bot's custom status text and presence
 * (online/idle/dnd/invisible) so they survive process restarts.
 *
 * Each platform gets its own row in `bot_configs`. When no
 * platform-specific row exists, the global (empty string) row
 * is used as a fallback.
 */
class BotConfigService {
  private readonly persistence: BotConfigStore;

  constructor(store: BotConfigStore) {
    this.persistence = store;
  }

  /**
   * Persist the bot's custom status text and optional emoji.
   *
   * @param text      - The status text (e.g. `"with cats"`).
   * @param emojiName - Emoji name (Unicode char, shortcode, or custom name).
   * @param emojiId   - Custom emoji ID (only for Discord custom emojis).
   * @param platform  - Platform to save for. Pass `''` for all platforms.
   * @param updatedBy - User ID who triggered the change.
   */
  async saveStatus(
    text: string,
    emojiName?: string | null,
    emojiId?: string | null,
    platform?: string
  ): Promise<void> {
    await this.persistence.set(platform ?? '', {
      statusText: text,
      statusEmojiName: emojiName ?? null,
      statusEmojiId: emojiId ?? null,
    });
  }

  /**
   * Persist the bot's presence status.
   *
   * @param status    - `'online'`, `'idle'`, `'dnd'`, or `'invisible'`.
   * @param platform  - Platform to save for. Pass `''` for all platforms.
   */
  async savePresence(status: string, platform?: string): Promise<void> {
    await this.persistence.set(platform ?? '', {
      presence: status,
    });
  }

  /**
   * Load the saved status and presence for a given platform.
   *
   * Returns the platform-specific values when available, falling back to
   * the global (all-platforms) row. Returns `null` for each field that
   * has never been saved.
   *
   * @param platform - Platform to load settings for (e.g. `'discord'`).
   */
  async loadStatusAndPresence(platform: string): Promise<BotStatusSnapshot> {
    const row = await this.persistence.getForPlatform(platform);

    if (!row) {
      return {
        statusText: null,
        statusEmojiName: null,
        statusEmojiId: null,
        presence: null,
      };
    }

    return {
      statusText: row.statusText ?? null,
      statusEmojiName: row.statusEmojiName || null,
      statusEmojiId: row.statusEmojiId || null,
      presence: row.presence ?? null,
    };
  }

  /**
   * Convenience method to persist both status and presence in one call.
   */
  async saveStatusAndPresence(
    opts: {
      statusText?: string;
      statusEmojiName?: string | null;
      statusEmojiId?: string | null;
      presence?: string;
    },
    platform?: string
  ): Promise<void> {
    await this.persistence.set(platform ?? '', {
      ...(opts.statusText !== undefined ? { statusText: opts.statusText } : {}),
      ...(opts.statusEmojiName !== undefined
        ? { statusEmojiName: opts.statusEmojiName ?? null }
        : {}),
      ...(opts.statusEmojiId !== undefined ? { statusEmojiId: opts.statusEmojiId ?? null } : {}),
      ...(opts.presence !== undefined ? { presence: opts.presence } : {}),
    });
  }

  // ── Low-level passthrough ───────────────────────────────────────────────

  /** Retrieve the full config row for a platform (or global). */
  async get(platform: string): Promise<BotConfigRow | null> {
    return this.persistence.get(platform);
  }

  /** Upsert fields on a platform's config row. */
  async set(platform: string, row: Partial<BotConfigRow>): Promise<void> {
    return this.persistence.set(platform, row);
  }
}

export { BotConfigService };

const store = process.env.DATABASE_URL ? new PostgresBotConfigStore() : new SqliteBotConfigStore();

console.log('[BOT-CONFIG] Using', process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite', 'backend.');

export const botConfigService = new BotConfigService(store);
