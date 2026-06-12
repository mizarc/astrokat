import { EventEmitter } from 'events';
import type { XPStore, XPEntry, GuildConfig, KeywordBonus } from './xpStore.js';

/** Cooldown period in milliseconds between XP-granting actions. */
const XP_COOLDOWN_MS = 60_000;

/** Base XP awarded per action. */
const XP_BASE = 10;

/** Random XP added on top of the base (0 to XP_VARIANCE-1). */
const XP_VARIANCE = 10;

/**
 * Total XP required to reach a given level (triangular number formula).
 * Levels are 1-based: level 1 requires 0 XP.
 *
 *   level 1 → 2:   100 XP
 *   level 2 → 3:   200 XP  (cumulative  300)
 *   level 3 → 4:   300 XP  (cumulative  600)
 *   level 4 → 5:   400 XP  (cumulative 1000)
 *   level 5 → 6:   500 XP  (cumulative 1500)
 */
export function xpForLevel(level: number): number {
  return (level - 1) * level / 2 * 100;
}

/**
 * Derive the current level from a total XP amount.
 * Returns 1 for users with 0 XP.
 */
export function levelFromXp(xp: number): number {
  // Inverse of triangular formula: level = floor((sqrt(1 + 8*xp/100) - 1) / 2) + 1
  return Math.floor((Math.sqrt(1 + 8 * xp / 100) - 1) / 2) + 1;
}

export interface XPLevelUpEvent {
  guildId: string;
  userId: string;
  platform: 'discord' | 'fluxer';
  oldLevel: number;
  newLevel: number;
  xp: number;
}

declare interface XPServiceEvents {
  levelUp: [event: XPLevelUpEvent];
}

class XPService extends EventEmitter<XPServiceEvents> {
  private readonly persistence: XPStore;

  constructor(store: XPStore) {
    super();
    this.persistence = store;
  }

  /**
   * Attempt to award XP to a user for an action.
   *
   * - Respects the cooldown: if the user acted less than `XP_COOLDOWN_MS`
   *   ago, this is a no-op.
   * - Randomises the XP gain slightly (10–19 XP).
   * - Scans `messageContent` for keyword-triggered XP bonuses and adds them on top.
   * - Emits `levelUp` when crossing a level threshold.
   *
   * Returns an object describing the result.
   */
  async awardXp(
    guildId: string,
    userId: string,
    platform: 'discord' | 'fluxer',
    messageContent?: string,
  ): Promise<{
    awarded: boolean;
    levelUp: { oldLevel: number; newLevel: number; earnedXp: number } | null;
    /** Whether this user has level-up notifications enabled (defaults to true). */
    xpNotifications: boolean;
    /** Bonus XP awarded from keyword triggers. */
    keywordBonus: number;
  }> {
    const now = Date.now();
    const existing = await this.persistence.getEntry(guildId, userId);

    // Cooldown check
    if (existing && (now - existing.lastActionAt) < XP_COOLDOWN_MS) {
      return { awarded: false, levelUp: null, xpNotifications: existing?.xpNotifications ?? false, keywordBonus: 0 };
    }

    let earnedXp = XP_BASE + Math.floor(Math.random() * XP_VARIANCE);
    let keywordBonus = 0;

    // Scan message content for keyword-triggered XP bonuses
    if (messageContent) {
      const words = new Set<string>();
      for (const word of messageContent.toLowerCase().split(/[\s,]+/)) {
        if (word.length > 0) words.add(word);
      }
      for (const word of words) {
        const bonusAmount = await this.persistence.getKeywordBonus(guildId, word);
        if (bonusAmount !== null && bonusAmount > 0) {
          earnedXp += bonusAmount;
          keywordBonus += bonusAmount;
        }
      }
    }

    const previousXp = existing?.xp ?? 0;
    const newXp = previousXp + earnedXp;
    const oldLevel = levelFromXp(previousXp);
    const newLevel = levelFromXp(newXp);

    const entry: XPEntry = {
      guildId,
      userId,
      platform: existing?.platform ?? platform,
      xp: newXp,
      level: newLevel,
      lastActionAt: now,
      updatedAt: now,
      xpNotifications: existing?.xpNotifications ?? false,
    };

    await this.persistence.upsertEntry(entry);

    // Emit level-up event if the user crossed a threshold
    if (newLevel > oldLevel) {
      const levelUpInfo = { oldLevel, newLevel, earnedXp };
      this.emit('levelUp', {
        guildId,
        userId,
        platform,
        oldLevel,
        newLevel,
        xp: newXp,
      });
      return { awarded: true, levelUp: levelUpInfo, xpNotifications: entry.xpNotifications ?? false, keywordBonus };
    }

    return { awarded: true, levelUp: null, xpNotifications: entry.xpNotifications ?? false, keywordBonus };
  }

  /** Get a user's XP entry. */
  async getEntry(guildId: string, userId: string): Promise<XPEntry | null> {
    return this.persistence.getEntry(guildId, userId);
  }

  /** Get the guild leaderboard. */
  async getLeaderboard(
    guildId: string,
    limit: number = 10,
    offset: number = 0,
  ): Promise<XPEntry[]> {
    return this.persistence.getLeaderboard(guildId, limit, offset);
  }

  /** Get a user's rank (1-based) in their guild. */
  async getUserRank(guildId: string, userId: string): Promise<number | null> {
    return this.persistence.getUserRank(guildId, userId);
  }

  /** Get the number of XP-tracked members in a guild. */
  async getMemberCount(guildId: string): Promise<number> {
    return this.persistence.getMemberCount(guildId);
  }

  /** Get guild-level XP configuration. */
  async getGuildConfig(guildId: string): Promise<GuildConfig> {
    return this.persistence.getGuildConfig(guildId);
  }

  /** Update guild-level XP configuration. */
  async setGuildConfig(guildId: string, config: Partial<GuildConfig>): Promise<void> {
    return this.persistence.setGuildConfig(guildId, config);
  }

  /** Toggle a user's level-up notification preference. */
  async setXpNotifications(guildId: string, userId: string, enabled: boolean): Promise<void> {
    return this.persistence.setXpNotifications(guildId, userId, enabled);
  }

  // ── Admin XP manipulation (no cooldown) ─────────────────────────────────

  /**
   * Directly set a user's XP to an exact value (admin override).
   * Recalculates level and emits levelUp if the level changed.
   * Does NOT respect the normal XP cooldown.
   */
  async setXpDirect(
    guildId: string,
    userId: string,
    platform: 'discord' | 'fluxer',
    xp: number,
  ): Promise<{ xp: number; level: number; oldLevel: number }> {
    const existing = await this.persistence.getEntry(guildId, userId);
    const oldLevel = levelFromXp(existing?.xp ?? 0);
    const newLevel = levelFromXp(xp);
    const now = Date.now();

    const entry: XPEntry = {
      guildId,
      userId,
      platform: existing?.platform ?? platform,
      xp,
      level: newLevel,
      lastActionAt: existing?.lastActionAt ?? now,
      updatedAt: now,
      xpNotifications: existing?.xpNotifications ?? false,
    };

    await this.persistence.upsertEntry(entry);

    if (newLevel > oldLevel) {
      this.emit('levelUp', { guildId, userId, platform, oldLevel, newLevel, xp });
    }

    return { xp, level: newLevel, oldLevel };
  }

  /**
   * Add XP to a user bypassing the normal cooldown (admin reward / keyword bonus).
   * Recalculates level and emits levelUp if the level changed.
   */
  async addXpDirect(
    guildId: string,
    userId: string,
    platform: 'discord' | 'fluxer',
    amount: number,
  ): Promise<{ xp: number; level: number; oldLevel: number }> {
    const existing = await this.persistence.getEntry(guildId, userId);
    const previousXp = existing?.xp ?? 0;
    const newXp = previousXp + amount;
    const oldLevel = levelFromXp(previousXp);
    const newLevel = levelFromXp(newXp);
    const now = Date.now();

    const entry: XPEntry = {
      guildId,
      userId,
      platform: existing?.platform ?? platform,
      xp: newXp,
      level: newLevel,
      lastActionAt: existing?.lastActionAt ?? now,
      updatedAt: now,
      xpNotifications: existing?.xpNotifications ?? false,
    };

    await this.persistence.upsertEntry(entry);

    if (newLevel > oldLevel) {
      this.emit('levelUp', { guildId, userId, platform, oldLevel, newLevel, xp: newXp });
    }

    return { xp: newXp, level: newLevel, oldLevel };
  }

  // ── Keyword bonuses ─────────────────────────────────────────────────────

  /** Get the bonus XP for a keyword in a guild. */
  async getKeywordBonus(guildId: string, keyword: string): Promise<number | null> {
    return this.persistence.getKeywordBonus(guildId, keyword);
  }

  /** Set a keyword bonus. */
  async setKeywordBonus(guildId: string, keyword: string, xpAmount: number): Promise<void> {
    return this.persistence.setKeywordBonus(guildId, keyword, xpAmount);
  }

  /** Remove a keyword bonus. */
  async removeKeywordBonus(guildId: string, keyword: string): Promise<void> {
    return this.persistence.removeKeywordBonus(guildId, keyword);
  }

  /** List all keyword bonuses for a guild. */
  async listKeywordBonuses(guildId: string): Promise<KeywordBonus[]> {
    return this.persistence.listKeywordBonuses(guildId);
  }
}

export { XPService };

import { SqliteXPStore } from './xpStoreSqlite.js';
import { PostgresXPStore } from './xpStorePostgres.js';

const store = process.env.DATABASE_URL
  ? new PostgresXPStore()
  : new SqliteXPStore();

console.log('[XP] Using', process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite', 'backend.');

export const xpService = new XPService(store);
