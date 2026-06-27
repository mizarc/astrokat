import type { RepStore, RepEntry } from './repStore.js';
import { SqliteRepStore } from './repStoreSqlite.js';
import { PostgresRepStore } from './repStorePostgres.js';

/** Max reputation tokens a user can give per rolling 24-hour window. */
const DAILY_ALLOWANCE = 3;
/** Rolling window for daily allowance. */
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** How long a giver must wait before repping the same target again. */
const TARGET_LOCKOUT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Result returned by {@link RepService.giveRep}.
 *
 * @property awarded - Whether the rep point was successfully awarded.
 * @property reason - Categorisation of the outcome or rejection reason.
 * @property totalRep - The receiver's lifetime rep score after the action
 *   (only meaningful when `awarded` is `true`).
 * @property allowanceUsed - How many of the 3 daily tokens the giver has
 *   used (only set when `reason` is `daily_allowance_exhausted`).
 * @property lockoutRemaining - Approximate milliseconds until the 7-day
 *   target lockout expires (only set when `reason` is `target_lockout`).
 */
export interface GiveRepResult {
  awarded: boolean;
  reason: 'success' | 'self_rep' | 'daily_allowance_exhausted' | 'target_lockout';
  totalRep: number;
  allowanceUsed?: number;
  lockoutRemaining?: number;
}

/**
 * Service layer for the reputation system.
 *
 * Owns the business logic — validation gates, rep awarding, leaderboard
 * reads, delegating all data access to an injected {@link RepStore}.
 */
class RepService {
  private readonly persistence: RepStore;

  /**
   * @param store - A {@link RepStore} implementation.
   */
  constructor(store: RepStore) {
    this.persistence = store;
  }

  /**
   * Award a reputation point to a user.
   *
   * Validates the request through a three-step gate (self-rep, daily
   * allowance, target lockout). On success, awards the point, consumes a 
   * daily token, and engages the 7-day lockout in a single flow.
   *
   * @param guildId - Guild ID where the command was issued.
   * @param giverId - User ID of the person giving the rep.
   * @param receiverId - User ID of the person receiving the rep.
   * @param platform - Platform the command originates from.
   * @returns A {@link GiveRepResult} describing the outcome.
   */
  async giveRep(
    guildId: string,
    giverId: string,
    receiverId: string,
    platform: 'discord' | 'fluxer'
  ): Promise<GiveRepResult> {
    // Do not allow users from repping themselves
    if (giverId === receiverId) {
      const entry = await this.persistence.getEntry(guildId, receiverId);
      return { awarded: false, reason: 'self_rep', totalRep: entry?.rep ?? 0 };
    }

    // Do not allow users to exceed their daily rep allowance
    const allowanceUsed = await this.persistence.getDailyAllowanceCount(guildId, giverId);
    if (allowanceUsed >= DAILY_ALLOWANCE) {
      const entry = await this.persistence.getEntry(guildId, receiverId);
      return {
        awarded: false,
        reason: 'daily_allowance_exhausted',
        totalRep: entry?.rep ?? 0,
        allowanceUsed,
      };
    }

    // Do not allow users to rep the same user more than once every x days
    const isLocked = await this.persistence.hasActiveTargetLockout(guildId, giverId, receiverId);
    if (isLocked) {
      const entry = await this.persistence.getEntry(guildId, receiverId);
      return {
        awarded: false,
        reason: 'target_lockout',
        totalRep: entry?.rep ?? 0,
        lockoutRemaining: TARGET_LOCKOUT_MS, // approximate
      };
    }

    // Award the rep point and record the action to allowance and lockout
    await this.persistence.addRepPoint(guildId, receiverId, platform);
    await this.persistence.recordDailyAllowance(guildId, giverId);
    await this.persistence.recordTargetLockout(guildId, giverId, receiverId);

    // Fetch the updated entry for the response
    const updated = await this.persistence.getEntry(guildId, receiverId);
    return { awarded: true, reason: 'success', totalRep: updated?.rep ?? 1 };
  }

  /**
   * Retrieve a user's permanent reputation entry for a guild.
   *
   * @param guildId - Server ID.
   * @param userId  - User ID to look up.
   * @returns The user's {@link RepEntry} or `null` if they have no rep yet.
   */
  async getEntry(guildId: string, userId: string): Promise<RepEntry | null> {
    return this.persistence.getEntry(guildId, userId);
  }

  /**
   * Get the reputation leaderboard for a guild, ordered by lifetime rep
   * descending.
   *
   * @param guildId - Target guild ID.
   * @param limit   - Maximum number of entries to return (default `10`).
   * @param offset  - Number of entries to skip for pagination (default `0`).
   * @returns An ordered array of {@link RepEntry RepEntries}.
   */
  async getLeaderboard(
    guildId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<RepEntry[]> {
    return this.persistence.getLeaderboard(guildId, limit, offset);
  }

  /**
   * Get a user's rank within their guild, sorted descending.
   *
   * @param guildId - Target guild id.
   * @param userId  - Target user ID.
   * @returns The user's numerical rank, or `null` if they have no entry.
   */
  async getUserRank(guildId: string, userId: string): Promise<number | null> {
    return this.persistence.getUserRank(guildId, userId);
  }

  /**
   * Get the total number of users who have at least one rep point.
   *
   * @param guildId - Target guild id.
   * @returns The member count.
   */
  async getMemberCount(guildId: string): Promise<number> {
    return this.persistence.getMemberCount(guildId);
  }
}

export { RepService };

const store = process.env.DATABASE_URL ? new PostgresRepStore() : new SqliteRepStore();

console.log('[REP] Using', process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite', 'backend.');

export const repService = new RepService(store);
