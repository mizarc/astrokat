/**
 * Join role bindings represent a mapping between a server, a role, and a
 * platform.
 *
 * Optional condition fields let admins delay assignment until the member's
 * account or server membership reaches a minimum age.
 */
export interface JoinRoleBinding {
  id: number;
  guildId: string;
  roleId: string;
  platform: string;
  /**
   * Minimum age of the Discord account (in minutes) before the role is assigned.
   * `null` means no account age restriction.
   */
  minAccountAgeMinutes: number | null;
  /**
   * Minimum time since the member joined the server (in minutes) before
   * the role is assigned.
   * `null` means no membership age restriction.
   */
  minMemberAgeMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields needed to create a new join-role binding. */
export type JoinRoleCreate = Pick<
  JoinRoleBinding,
  'guildId' | 'roleId' | 'platform' | 'minAccountAgeMinutes' | 'minMemberAgeMinutes'
>;

/**
 * Abstract storage interface for join-role bindings.
 */
export interface JoinRoleStore {
  /** Create a new join-role binding. Returns the new binding's ID. */
  create(binding: JoinRoleCreate): Promise<number>;

  /** Get all bindings for a guild. */
  getByGuild(guildId: string): Promise<JoinRoleBinding[]>;

  /** Get a single binding by its primary key. */
  getById(id: number): Promise<JoinRoleBinding | null>;

  /** Get a binding by guild + role. */
  getByGuildAndRole(guildId: string, roleId: string): Promise<JoinRoleBinding | null>;

  /** Delete a binding by its primary key. */
  delete(id: number): Promise<void>;

  /** Delete all bindings for a guild + role. */
  deleteByGuildAndRole(guildId: string, roleId: string): Promise<void>;

  /** Delete all bindings for a guild. */
  deleteByGuild(guildId: string): Promise<void>;

  /** Get all bindings across all guilds (for startup reconciliation). */
  getAllBindings(): Promise<JoinRoleBinding[]>;

  /** Get all distinct guild IDs that have bindings. */
  getAllGuildIds(): Promise<string[]>;
}
