/**
 * Level role bindings map a guild + level to a role.
 * When a user reaches a certain level, the role is automatically assigned.
 */
export interface LevelRoleBinding {
  id: number;
  guildId: string;
  roleId: string;
  /** The level at which this role is granted. */
  level: number;
  platform: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields needed to create a new level-role binding. */
export type LevelRoleCreate = Pick<LevelRoleBinding, 'guildId' | 'roleId' | 'level' | 'platform'>;

/**
 * Abstract storage interface for level-role bindings.
 */
export interface LevelRoleStore {
  /** Create a new level-role binding. Returns the new binding's ID. */
  create(binding: LevelRoleCreate): Promise<number>;

  /** Get all bindings for a guild, ordered by level ascending. */
  getByGuild(guildId: string): Promise<LevelRoleBinding[]>;

  /** Get a single binding by its primary key. */
  getById(id: number): Promise<LevelRoleBinding | null>;

  /** Get a binding by guild + level. */
  getByGuildAndLevel(guildId: string, level: number): Promise<LevelRoleBinding | null>;

  /** Get a binding by guild + role. */
  getByGuildAndRole(guildId: string, roleId: string): Promise<LevelRoleBinding | null>;

  /** Get the highest level-role the user qualifies for in a guild (level <= userLevel). */
  getHighestForGuildUpToLevel(guildId: string, userLevel: number): Promise<LevelRoleBinding | null>;

  /** Delete a binding by its primary key. */
  delete(id: number): Promise<void>;

  /** Delete all bindings for a guild + role. */
  deleteByGuildAndRole(guildId: string, roleId: string): Promise<void>;

  /** Get all bindings across all guilds. */
  getAllBindings(): Promise<LevelRoleBinding[]>;

  /** Get all distinct guild IDs that have bindings. */
  getAllGuildIds(): Promise<string[]>;
}
