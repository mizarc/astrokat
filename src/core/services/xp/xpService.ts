import { EventEmitter } from 'events';
import type { XPStore, XPEntry } from './xpStore.js';

/** Cooldown period in milliseconds between XP-granting actions. */
const XP_COOLDOWN_MS = 60_000;

/** Base XP awarded per action. */
const XP_BASE = 10;

/** Random XP added on top of the base (0 to XP_VARIANCE-1). */
const XP_VARIANCE = 10;

/**
 * Total XP required to reach a given level (triangular number formula).
 *
 *   level 0 → 1:  100 XP
 *   level 1 → 2:  200 XP  (cumulative  300)
 *   level 2 → 3:  300 XP  (cumulative  600)
 *   level 3 → 4:  400 XP  (cumulative 1000)
 *   level 4 → 5:  500 XP  (cumulative 1500)
 */
export function xpForLevel(level: number): number {
  return level * (level + 1) / 2 * 100;
}

/**
 * Derive the current level from a total XP amount.
 */
export function levelFromXp(xp: number): number {
  // Inverse of triangular formula: level = floor((sqrt(1 + 8*xp/100) - 1) / 2)
  return Math.floor((Math.sqrt(1 + 8 * xp / 100) - 1) / 2);
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
   * - Emits `levelUp` when crossing a level threshold.
   *
   * Returns an object describing the result, or `null` if on cooldown.
   */
  async awardXp(
    guildId: string,
    userId: string,
    platform: 'discord' | 'fluxer',
  ): Promise<{ awarded: boolean; levelUp: { oldLevel: number; newLevel: number; earnedXp: number } | null }> {
    const now = Date.now();
    const existing = await this.persistence.getEntry(guildId, userId);

    // Cooldown check
    if (existing && (now - existing.lastActionAt) < XP_COOLDOWN_MS) {
      return { awarded: false, levelUp: null };
    }

    const earnedXp = XP_BASE + Math.floor(Math.random() * XP_VARIANCE);
    const previousXp = existing?.xp ?? 0;
    const newXp = previousXp + earnedXp;
    const oldLevel = existing?.level ?? 0;
    const newLevel = levelFromXp(newXp);

    const entry: XPEntry = {
      guildId,
      userId,
      platform: existing?.platform ?? platform,
      xp: newXp,
      level: newLevel,
      lastActionAt: now,
      updatedAt: now,
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
      return { awarded: true, levelUp: levelUpInfo };
    }

    return { awarded: true, levelUp: null };
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
}

export { XPService };

import { SqliteXPStore } from './xpStoreSqlite.js';
import { PostgresXPStore } from './xpStorePostgres.js';

const store = process.env.DATABASE_URL
  ? new PostgresXPStore()
  : new SqliteXPStore();

console.log('[XP] Using', process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite', 'backend.');

export const xpService = new XPService(store);
