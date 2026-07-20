import { t } from '../../i18n.js';
import type { LevelRoleStore, LevelRoleBinding, LevelRoleCreate } from './levelRoleStore.js';
import { SqliteLevelRoleStore } from './levelRoleStoreSqlite.js';
import { PostgresLevelRoleStore } from './levelRoleStorePostgres.js';
import type { XPLevelUpEvent } from '../xp/xpService.js';
import { xpService } from '../xp/xpService.js';

/** Max level-role bindings per guild. */
const MAX_BINDINGS_PER_GUILD = 20;

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
 * Service layer for level roles.
 *
 * Manages bindings between levels and roles. When a user levels up,
 * the service automatically assigns the role for that level.
 *
 * Listens to the XP service's `levelUp` event to trigger role assignment.
 */
class LevelRoleService {
  private readonly levelRoleStore: LevelRoleStore;

  /** Registered by the adapter to assign roles in a guild. */
  private assignRole: RoleAssignCallback | null = null;

  /**
   * In-memory set of guild IDs that have level role bindings.
   * Avoids unnecessary lookups on the hot path.
   */
  private guildsWithLevelRoles: Set<string> = new Set();

  constructor(levelRoleStore: LevelRoleStore) {
    this.levelRoleStore = levelRoleStore;

    // Listen for level-up events from the XP service
    xpService.on('levelUp', (event: XPLevelUpEvent) => {
      this.handleLevelUp(event).catch((err) => {
        console.error('[LEVEL_ROLE] Error handling level-up:', err);
      });
    });
  }

  /**
   * Initialise the service — loads the guild cache from the database.
   * Should be called once at startup after adapters are registered.
   */
  async init(): Promise<void> {
    await this.refreshGuildCache();
  }

  /** Refresh the in-memory guild cache from the database. */
  private async refreshGuildCache(): Promise<void> {
    const ids = await this.levelRoleStore.getAllGuildIds();
    this.guildsWithLevelRoles = new Set(ids);
  }

  /**
   * Register the role-assignment callback.
   * Must be called by the adapter before any level-up events fire.
   */
  setRoleAssigner(callback: RoleAssignCallback): void {
    this.assignRole = callback;
  }

  /**
   * Add a level-role binding.
   * Throws if the level is already bound in this guild.
   */
  async addBinding(binding: LevelRoleCreate): Promise<LevelRoleBinding> {
    if (binding.level < 1) {
      throw new Error(t('commands.role.level.add.invalidLevel'));
    }

    const existing = await this.levelRoleStore.getByGuildAndLevel(binding.guildId, binding.level);

    if (existing) {
      throw new Error(
        t('commands.role.level.add.levelAlreadyBound', {
          level: binding.level,
          roleId: existing.roleId,
        })
      );
    }

    // Check role is not already bound to another level
    const existingRole = await this.levelRoleStore.getByGuildAndRole(
      binding.guildId,
      binding.roleId
    );

    if (existingRole) {
      throw new Error(
        t('commands.role.level.add.roleAlreadyBound', {
          roleId: binding.roleId,
          level: existingRole.level,
        })
      );
    }

    // Enforce per-guild binding limit
    const current = await this.levelRoleStore.getByGuild(binding.guildId);
    if (current.length >= MAX_BINDINGS_PER_GUILD) {
      throw new Error(t('commands.role.level.add.maxBindings', { max: MAX_BINDINGS_PER_GUILD }));
    }

    const id = await this.levelRoleStore.create(binding);
    const created = await this.levelRoleStore.getById(id);
    if (!created) {
      throw new Error(t('commands.role.level.add.errorGeneric'));
    }

    // Update cache
    this.guildsWithLevelRoles.add(binding.guildId);

    return created;
  }

  /**
   * Remove a level-role binding by guild + role.
   * Returns true if a binding was removed, false if none existed.
   */
  async removeBinding(guildId: string, roleId: string): Promise<boolean> {
    const existing = await this.levelRoleStore.getByGuildAndRole(guildId, roleId);
    if (!existing) return false;

    await this.levelRoleStore.deleteByGuildAndRole(guildId, roleId);

    // If guild has no more bindings, remove from cache
    const remaining = await this.levelRoleStore.getByGuild(guildId);
    if (remaining.length === 0) {
      this.guildsWithLevelRoles.delete(guildId);
    }

    return true;
  }

  /**
   * List all level-role bindings for a guild, ordered by level ascending.
   */
  async listBindings(guildId: string): Promise<LevelRoleBinding[]> {
    return this.levelRoleStore.getByGuild(guildId);
  }

  /**
   * Get a single binding by guild + level.
   */
  async getBinding(guildId: string, level: number): Promise<LevelRoleBinding | null> {
    return this.levelRoleStore.getByGuildAndLevel(guildId, level);
  }

  /**
   * Check and assign a level role for a user.
   *
   * Designed to be called on every message XP award. Uses the in-memory
   * guild cache to skip guilds with no bindings, then checks the user's
   * current roles (from the cached message object) to avoid unnecessary
   * API calls.
   *
   * This naturally handles retroactive catchup — if an admin adds a
   * binding after users have already passed that level, they get the
   * role on their next message.
   *
   * @param guildId - The guild the user is in
   * @param userId - The user to check
   * @param userLevel - The user's current level
   * @param currentRoleIds - The user's current role IDs (cached, optional)
   */
  async checkAndAssign(
    guildId: string,
    userId: string,
    userLevel: number,
    currentRoleIds?: string[]
  ): Promise<void> {
    if (!this.assignRole) return;
    if (!this.guildsWithLevelRoles.has(guildId)) return;

    const binding = await this.levelRoleStore.getHighestForGuildUpToLevel(guildId, userLevel);
    if (!binding) return;

    // Skip if user already has the role (from cached message data — no API call)
    if (currentRoleIds && currentRoleIds.includes(binding.roleId)) return;

    const success = await this.assignRole(guildId, userId, binding.roleId);

    if (!success) {
      console.warn(
        `[LEVEL_ROLE] Failed to assign role ${binding.roleId} to user ${userId} in guild ${guildId}`
      );
    }
  }

  /**
   * Handle a user level-up event.
   *
   * Checks if there's a role configured for the new level and assigns it.
   * Also checks if there's a higher-level role the user now qualifies for
   * (e.g. if multiple roles were configured and admin sets roles at levels
   * 5, 10, 15 — reaching level 12 means they get the level 10 role).
   */
  async handleLevelUp(event: XPLevelUpEvent): Promise<void> {
    if (!this.assignRole) {
      console.warn('[LEVEL_ROLE] No role assigner registered — cannot assign level roles.');
      return;
    }

    if (!this.guildsWithLevelRoles.has(event.guildId)) {
      return; // No level roles configured for this guild
    }

    // Check if there's a role for this specific level first
    let binding = await this.levelRoleStore.getByGuildAndLevel(event.guildId, event.newLevel);

    // If no exact match, find the highest role the user now qualifies for
    if (!binding) {
      binding = await this.levelRoleStore.getHighestForGuildUpToLevel(
        event.guildId,
        event.newLevel
      );
    }

    if (!binding) return;

    const success = await this.assignRole(event.guildId, event.userId, binding.roleId);

    if (!success) {
      console.warn(
        `[LEVEL_ROLE] Failed to assign role ${binding.roleId} to user ${event.userId} in guild ${event.guildId}`
      );
    }
  }
}

export { LevelRoleService };

const store = process.env.DATABASE_URL ? new PostgresLevelRoleStore() : new SqliteLevelRoleStore();

console.log('[LEVEL_ROLE] Using', process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite', 'backend.');

export const levelRoleService = new LevelRoleService(store);
