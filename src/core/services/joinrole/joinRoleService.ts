import { t } from '../../i18n.js';
import type { JoinRoleStore, JoinRoleBinding, JoinRoleCreate } from './joinRoleStore.js';
import { SqliteJoinRoleStore } from './joinRoleStoreSqlite.js';
import { PostgresJoinRoleStore } from './joinRoleStorePostgres.js';
import type { PendingAssignmentStore, PendingRoleAssignment } from './pendingAssignmentStore.js';
import { SqlitePendingAssignmentStore } from './pendingAssignmentStoreSqlite.js';
import { PostgresPendingAssignmentStore } from './pendingAssignmentStorePostgres.js';

/** Polling interval for the background worker (in milliseconds). */
const POLL_INTERVAL_MS = 5_000;

/** Max pending assignments to process per poll cycle. */
const WORKER_BATCH_LIMIT = 100;

/** Max concurrent role assignment API calls per guild (avoids hammering rate limits). */
const MAX_CONCURRENT_PER_GUILD = 5;

/**
 * Callback registered by an adapter to assign a role to a user in a guild.
 * Returns true if the role was successfully assigned.
 */
export type RoleAssignCallback = (
  guildId: string,
  userId: string,
  roleId: string
) => Promise<boolean>;

/**
 * Service layer for join roles.
 *
 * Manages bindings between guilds and roles assigned on member join,
 * with optional conditional delays (account age, membership age).
 *
 * A background worker polls for due pending assignments that couldn't
 * be fulfilled immediately because of age conditions.
 */
class JoinRoleService {
  private readonly joinRoleStore: JoinRoleStore;
  private readonly pendingStore: PendingAssignmentStore;

  /** Registered by the adapter to assign roles in a guild. */
  private assignRole: RoleAssignCallback | null = null;

  /** Background worker interval handle. */
  private workerTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * In-memory set of guild IDs that have join role bindings.
   * Skips the DB query entirely on the hot path (member join) for
   * guilds without any configured join roles.
   */
  private guildsWithJoinRoles: Set<string> = new Set();

  /**
   * Tracks how many role assignment API calls are currently in-flight per 
   * guild. Used to cap concurrency and avoid hitting Discord's per-route 
   * rate limits during join bursts.
   */
  private guildActiveCount: Map<string, number> = new Map();

  constructor(joinRoleStore: JoinRoleStore, pendingStore: PendingAssignmentStore) {
    this.joinRoleStore = joinRoleStore;
    this.pendingStore = pendingStore;
  }

  /** Refresh the in-memory guild cache from the database. */
  private async refreshGuildCache(): Promise<void> {
    const ids = await this.joinRoleStore.getAllGuildIds();
    this.guildsWithJoinRoles = new Set(ids);
  }

  /**
   * Register the role-assignment callback.
   * Must be called by the adapter before the background worker starts.
   */
  setRoleAssigner(callback: RoleAssignCallback): void {
    this.assignRole = callback;
  }

  /**
   * Add a join role binding.
   * Throws if the role is already bound in this guild.
   */
  async addBinding(binding: JoinRoleCreate): Promise<JoinRoleBinding> {
    const existing = await this.joinRoleStore.getByGuildAndRole(binding.guildId, binding.roleId);

    if (existing) {
      throw new Error(t('commands.role.join.add.alreadyBound', { roleId: binding.roleId }));
    }

    const id = await this.joinRoleStore.create(binding);
    const created = await this.joinRoleStore.getById(id);
    if (!created) {
      throw new Error(t('commands.role.join.add.errorGeneric'));
    }

    // Update cache if this is the first binding for this guild
    this.guildsWithJoinRoles.add(binding.guildId);

    return created;
  }

  /**
   * Remove a join-role binding by guild + role.
   * Returns true if a binding was removed, false if none existed.
   */
  async removeBinding(guildId: string, roleId: string): Promise<boolean> {
    const existing = await this.joinRoleStore.getByGuildAndRole(guildId, roleId);
    if (!existing) return false;

    await this.joinRoleStore.deleteByGuildAndRole(guildId, roleId);
    // Also clean up any pending assignments for this role
    const allPending = await this.pendingStore.getAllPending();
    for (const p of allPending) {
      if (p.guildId === guildId && p.roleId === roleId) {
        await this.pendingStore.deletePending(guildId, p.userId, roleId);
      }
    }

    // If guild has no more bindings, remove from cache
    const remaining = await this.joinRoleStore.getByGuild(guildId);
    if (remaining.length === 0) {
      this.guildsWithJoinRoles.delete(guildId);
    }

    return true;
  }

  /**
   * List all join-role bindings for a guild.
   */
  async listBindings(guildId: string): Promise<JoinRoleBinding[]> {
    return this.joinRoleStore.getByGuild(guildId);
  }

  /**
   * Get a single binding by guild + role.
   */
  async getBinding(guildId: string, roleId: string): Promise<JoinRoleBinding | null> {
    return this.joinRoleStore.getByGuildAndRole(guildId, roleId);
  }

  /**
   * Handle a member joining a guild.
   *
   * For each configured join-role binding:
   * - If no conditions are set, the role is assigned immediately.
   * - If conditions are set, a pending assignment is created with the
   *   appropriate `dueAt` timestamp. The background worker will
   *   pick it up later.
   *
   * Returns an array of role IDs that were assigned immediately.
   */
  async handleMemberJoin(
    guildId: string,
    userId: string,
    platform: string,
    /** Unix timestamp (seconds) of when the user's account was created. */
    accountCreatedAt: number,
    /** Unix timestamp (seconds) of when the user joined this guild. */
    joinedAt: number
  ): Promise<{ assigned: string[]; pending: string[] }> {
    // No join roles configured for this guild, skip DB query entirely
    if (!this.guildsWithJoinRoles.has(guildId)) {
      return { assigned: [], pending: [] };
    }

    const bindings = await this.joinRoleStore.getByGuild(guildId);
    const assigned: string[] = [];
    const pending: string[] = [];

    const now = Math.floor(Date.now() / 1000);

    for (const binding of bindings) {
      // Skip bindings for other platforms
      if (binding.platform !== platform) continue;

      // Calculate the delay needed
      let delaySeconds = 0;

      if (binding.minAccountAgeMinutes) {
        const accountAge = now - accountCreatedAt;
        const requiredAge = binding.minAccountAgeMinutes * 60;
        if (accountAge < requiredAge) {
          delaySeconds = Math.max(delaySeconds, requiredAge - accountAge);
        }
      }

      if (binding.minMemberAgeMinutes) {
        const memberAge = now - joinedAt;
        const requiredAge = binding.minMemberAgeMinutes * 60;
        if (memberAge < requiredAge) {
          delaySeconds = Math.max(delaySeconds, requiredAge - memberAge);
        }
      }

      if (delaySeconds === 0) {
        // Assign immediately if no conditions are set or already satisfied
        if (this.assignRole) {
          try {
            await this.assignRole(guildId, userId, binding.roleId);
            assigned.push(binding.roleId);
          } catch {
            // If assignment fails, create a pending assignment to retry.
            const dueAt = now + 60; // retry in 1 minute
            await this.pendingStore.create({
              guildId,
              userId,
              roleId: binding.roleId,
              platform,
              dueAt,
            });
            pending.push(binding.roleId);
          }
        }
      } else {
        // Create pending assignment
        const dueAt = now + delaySeconds;
        await this.pendingStore.create({
          guildId,
          userId,
          roleId: binding.roleId,
          platform,
          dueAt,
        });
        pending.push(binding.roleId);
      }
    }

    return { assigned, pending };
  }

  /**
   * Handle a member leaving a guild.
   *
   * Cleans up any pending delayed role assignments for this user so the
   * background worker doesn't try to assign roles to someone who's gone.
   */
  async handleMemberLeave(guildId: string, userId: string): Promise<void> {
    await this.pendingStore.deletePendingByUser(guildId, userId);
  }

  /**
   * Start the background worker that polls for due pending assignments.
   *
   * Restores any pending assignments from the database so they
   * survive restarts.
   */
  async startWorker(): Promise<void> {
    // Populate in-memory cache of guilds with join roles
    await this.refreshGuildCache();
    console.log(
      `[JOINROLE] Cached ${this.guildsWithJoinRoles.size} guild(s) with join role bindings.`
    );

    // Restore pending assignments from previous sessions
    const restored = await this.pendingStore.getAllPending();
    if (restored.length > 0) {
      console.log(`[JOINROLE] Restored ${restored.length} pending role assignment(s).`);
    }

    if (this.workerTimer) return;

    this.workerTimer = setInterval(() => {
      this.processDueAssignments().catch((err) => {
        console.error('[JOINROLE] Background worker error:', err);
      });
    }, POLL_INTERVAL_MS);

    // Process immediately on start
    this.processDueAssignments().catch((err) => {
      console.error('[JOINROLE] Initial processing error:', err);
    });
  }

  /**
   * Stop the background worker.
   */
  stopWorker(): void {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  /**
   * Process all pending assignments that are due.
   * Runs in batches of WORKER_BATCH_LIMIT to avoid blocking the event loop.
   * Caps concurrent API calls per guild to avoid Discord rate limits.
   */
  private async processDueAssignments(): Promise<void> {
    if (!this.assignRole) return;

    const now = Math.floor(Date.now() / 1000);

    let processed = 0;
    let batch: PendingRoleAssignment[];

    do {
      batch = await this.pendingStore.getDue(now, WORKER_BATCH_LIMIT);

      for (const assignment of batch) {
        const guildId = assignment.guildId;
        const active = this.guildActiveCount.get(guildId) ?? 0;

        // Skip this cycle if this guild is already at its concurrency limit.
        // The assignment stays in the DB and will be picked up next poll.
        if (active >= MAX_CONCURRENT_PER_GUILD) continue;

        this.guildActiveCount.set(guildId, active + 1);

        // Don't block the batch loop on each call
        this.executeAssignment(assignment).finally(() => {
          const remaining = (this.guildActiveCount.get(guildId) ?? 1) - 1;
          if (remaining <= 0) {
            this.guildActiveCount.delete(guildId);
          } else {
            this.guildActiveCount.set(guildId, remaining);
          }
        });
        processed++;
      }

      // Wait for all in-flight assignments in this batch to settle before
      // fetching the next batch, so we don't pile up unlimited concurrent work.
      await this.drainGuildQueue();
    } while (batch.length === WORKER_BATCH_LIMIT);

    if (processed > 0) {
      console.log(`[JOINROLE] Processed ${processed} pending assignment(s).`);
    }
  }

  /**
   * Execute a single pending assignment via the adapter callback.
   */
  private async executeAssignment(assignment: PendingRoleAssignment): Promise<void> {
    try {
      const success = await this.assignRole!(
        assignment.guildId,
        assignment.userId,
        assignment.roleId
      );
      if (!success) {
        console.warn(
          `[JOINROLE] Failed to assign role ${assignment.roleId} to user ${assignment.userId} in guild ${assignment.guildId}`
        );
      }
    } catch (error) {
      console.error(
        `[JOINROLE] Error assigning role ${assignment.roleId} to user ${assignment.userId} in guild ${assignment.guildId}:`,
        error
      );
    }

    try {
      await this.pendingStore.deletePending(
        assignment.guildId,
        assignment.userId,
        assignment.roleId
      );
    } catch (error) {
      console.error(`[JOINROLE] Failed to delete pending assignment ${assignment.id}:`, error);
    }
  }

  /**
   * Wait until all guilds have zero in-flight assignments.
   * Used between batch iterations to prevent unbounded concurrency.
   */
  private async drainGuildQueue(): Promise<void> {
    while (this.guildActiveCount.size > 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  /**
   * Get all pending assignments for a guild (for admin view).
   */
  async getPendingForGuild(guildId: string): Promise<PendingRoleAssignment[]> {
    const all = await this.pendingStore.getAllPending();
    return all.filter((a) => a.guildId === guildId);
  }
}

export { JoinRoleService };

const joinRoleStore: JoinRoleStore = process.env.DATABASE_URL
  ? new PostgresJoinRoleStore()
  : new SqliteJoinRoleStore();

const pendingStore: PendingAssignmentStore = process.env.DATABASE_URL
  ? new PostgresPendingAssignmentStore()
  : new SqlitePendingAssignmentStore();

export const joinRoleService = new JoinRoleService(joinRoleStore, pendingStore);
