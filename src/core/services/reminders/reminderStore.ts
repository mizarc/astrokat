export type Platform = 'discord' | 'fluxer';

export interface Reminder {
  id: string;
  userId: string;
  channelId: string;
  guildId: string;
  platform: Platform;
  message: string;
  dispatchTime: number; // Unix timestamp (seconds)
  createdAt: number;
  referenceMessageId?: string;
}

/**
 * Abstract storage interface for reminders.
 */
export interface ReminderStore {
  /** Persist a new reminder. */
  save(reminder: Reminder): Promise<void>;

  /** Remove a reminder by ID.  */
  delete(id: string): Promise<void>;

  /** Load reminders, optionally filtered by platform. */
  loadAll(platform?: Platform): Promise<Reminder[]>;
}

