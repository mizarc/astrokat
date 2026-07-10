import type {
  ReactionRoleStore,
  ReactionRoleBinding,
  ReactionRoleCreate,
} from './reactionRoleStore.js';
import { SqliteReactionRoleStore } from './reactionRoleStoreSqlite.js';
import { PostgresReactionRoleStore } from './reactionRoleStorePostgres.js';

/**
 * Service layer for reaction roles.
 *
 * Manages bindings between (message + emoji) pairs and roles,
 * and handles role assignment/removal when reactions are added or removed.
 * Platform-agnostic — the adapter feeds events in, the service does the rest.
 */
class ReactionRoleService {
  private readonly persistence: ReactionRoleStore;

  constructor(store: ReactionRoleStore) {
    this.persistence = store;
  }

  /**
   * Bind an emoji to a role on a specific message.
   * Throws if the binding already exists.
   */
  async addBinding(binding: ReactionRoleCreate): Promise<ReactionRoleBinding> {
    const existing = await this.persistence.getByMessageAndEmoji(
      binding.guildId,
      binding.messageId,
      binding.emoji
    );

    if (existing) {
      throw new Error(`Emoji "${binding.emoji}" is already bound on that message.`);
    }

    const id = await this.persistence.create(binding);
    const created = await this.persistence.getById(id);
    if (!created) {
      throw new Error('Failed to create reaction role binding.');
    }
    return created;
  }

  /**
   * Remove a binding by guild + message + emoji.
   * Returns true if a binding was removed, false if none existed.
   */
  async removeBinding(guildId: string, messageId: string, emoji: string): Promise<boolean> {
    const existing = await this.persistence.getByMessageAndEmoji(guildId, messageId, emoji);
    if (!existing) return false;

    await this.persistence.delete(existing.id);
    return true;
  }

  /**
   * List all bindings for a guild, optionally filtered by message.
   */
  async listBindings(guildId: string, messageId?: string): Promise<ReactionRoleBinding[]> {
    if (messageId) {
      return this.persistence.getByMessage(guildId, messageId);
    }
    return this.persistence.getByGuild(guildId);
  }

  /**
   * Get a single binding by guild + message + emoji.
   */
  async getBinding(
    guildId: string,
    messageId: string,
    emoji: string
  ): Promise<ReactionRoleBinding | null> {
    return this.persistence.getByMessageAndEmoji(guildId, messageId, emoji);
  }

  /**
   * Assign a role to a user when they add a reaction.
   * Returns the role ID that was assigned, or null if no binding matched.
   */
  async handleReactionAdd(
    guildId: string,
    messageId: string,
    emoji: string,
    member: { roles: { add: (roleId: string) => Promise<void> } }
  ): Promise<string | null> {
    const binding = await this.persistence.getByMessageAndEmoji(guildId, messageId, emoji);
    if (!binding) return null;

    try {
      await member.roles.add(binding.roleId);
      return binding.roleId;
    } catch (error) {
      console.error(`[REACTION_ROLE] Failed to assign role ${binding.roleId} to user:`, error);
      return null;
    }
  }

  /**
   * Remove a role from a user when they remove a reaction.
   * Returns the role ID that was removed, or null if no binding matched.
   */
  async handleReactionRemove(
    guildId: string,
    messageId: string,
    emoji: string,
    member: { roles: { remove: (roleId: string) => Promise<void> } }
  ): Promise<string | null> {
    const binding = await this.persistence.getByMessageAndEmoji(guildId, messageId, emoji);
    if (!binding) return null;

    try {
      await member.roles.remove(binding.roleId);
      return binding.roleId;
    } catch (error) {
      console.error(`[REACTION_ROLE] Failed to remove role ${binding.roleId} from user:`, error);
      return null;
    }
  }

  /**
   * Fetch all bindings across the database for reconciliation.
   * Used on startup to scan existing reactions and assign missed roles.
   */
  async getAllBindings(): Promise<ReactionRoleBinding[]> {
    return this.persistence.getAllBindings();
  }

  /**
   * Get all unique guild IDs that have reaction role bindings.
   */
  async getGuildIds(): Promise<string[]> {
    return this.persistence.getAllGuildIds();
  }
}

export { ReactionRoleService };

const store = process.env.DATABASE_URL
  ? new PostgresReactionRoleStore()
  : new SqliteReactionRoleStore();

console.log(
  '[REACTION_ROLE] Using',
  process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite',
  'backend.'
);

export const reactionRoleService = new ReactionRoleService(store);
