/**
 * A single reaction role binding.
 *
 * Maps one (message + emoji) pair to a role.
 * Multiple bindings can exist on the same message with different emojis.
 */
export interface ReactionRoleBinding {
  id: number;
  guildId: string;
  messageId: string;
  emoji: string;
  roleId: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields needed to create a new binding. */
export type ReactionRoleCreate = Pick<
  ReactionRoleBinding,
  'guildId' | 'messageId' | 'emoji' | 'roleId'
>;

/**
 * Abstract storage interface for reaction role bindings.
 */
export interface ReactionRoleStore {
  /** Create a new binding. Returns the new binding's ID. */
  create(binding: ReactionRoleCreate): Promise<number>;

  /** Get all bindings for a guild. */
  getByGuild(guildId: string): Promise<ReactionRoleBinding[]>;

  /** Get all bindings for a specific message. */
  getByMessage(guildId: string, messageId: string): Promise<ReactionRoleBinding[]>;

  /** Get a single binding by its primary key. */
  getById(id: number): Promise<ReactionRoleBinding | null>;

  /** Get a specific binding by guild + message + emoji. */
  getByMessageAndEmoji(
    guildId: string,
    messageId: string,
    emoji: string
  ): Promise<ReactionRoleBinding | null>;

  /** Delete a binding by its primary key. */
  delete(id: number): Promise<void>;

  /** Delete a binding by guild + message + emoji. */
  deleteByMessageAndEmoji(guildId: string, messageId: string, emoji: string): Promise<void>;

  /** Get all bindings across all guilds (for startup reconciliation). */
  getAllBindings(): Promise<ReactionRoleBinding[]>;

  /** Get all distinct guild IDs that have bindings. */
  getAllGuildIds(): Promise<string[]>;
}
