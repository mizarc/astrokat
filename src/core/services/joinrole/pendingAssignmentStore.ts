/**
 * A pending role assignment, created when a member joins but their role
 * conditions (account age, membership age) are not yet met.
 *
 * Polled by a background worker that assigns the role once `dueAt` is
 * reached, then deletes the row.
 */
export interface PendingRoleAssignment {
  id: number;
  guildId: string;
  userId: string;
  roleId: string;
  platform: string;
  dueAt: number;
  createdAt: string;
}

/** Fields needed to create a new pending assignment. */
export type PendingAssignmentCreate = Pick<
  PendingRoleAssignment,
  'guildId' | 'userId' | 'roleId' | 'platform' | 'dueAt'
>;

/**
 * Abstract storage interface for pending role assignments.
 */
export interface PendingAssignmentStore {
  /** Create a new pending assignment. Returns its ID. */
  create(assignment: PendingAssignmentCreate): Promise<number>;

  /** Get all pending assignments that are due (dueAt <= now). */
  getDue(now: number, limit?: number): Promise<PendingRoleAssignment[]>;

  /** Get all pending assignments across all guilds (for startup restoration). */
  getAllPending(): Promise<PendingRoleAssignment[]>;

  /** Delete a specific pending assignment by guild + user + role. */
  deletePending(guildId: string, userId: string, roleId: string): Promise<void>;

  /** Delete all pending assignments for a user in a guild (e.g. on member leave). */
  deletePendingByUser(guildId: string, userId: string): Promise<void>;
}
