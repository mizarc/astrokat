import { EventEmitter } from 'events';
import { t } from '../../i18n.js';
import type { Reminder, ReminderStore, Platform } from './reminderStore.js';

export interface ReminderDueEvent {
  reminder: Reminder;
}

declare interface ReminderServiceEvents {
  reminderDue: [event: ReminderDueEvent];
}

class ReminderService extends EventEmitter<ReminderServiceEvents> {
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private memoryStore: Map<string, Reminder> = new Map();
  private readonly persistence: ReminderStore;
  private initialized = false;

  constructor(store: ReminderStore) {
    super();
    this.persistence = store;
  }

  /**
   * Load all persisted reminders and re-schedule any whose dispatch time is
   * still in the future. Safe to call multiple times — subsequent calls are
   * no-ops.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const reminders = await this.persistence.loadAll();
    const now = Math.floor(Date.now() / 1000);
    let loaded = 0;
    let expired = 0;

    for (const reminder of reminders) {
      if (reminder.dispatchTime <= now) {
        // Already past — dispatch immediately
        expired++;
        this.fireReminder(reminder);
      } else {
        // Still pending — schedule
        loaded++;
        this.memoryStore.set(reminder.id, reminder);
        this.scheduleTimeout(reminder);
      }
    }

    if (loaded > 0 || expired > 0) {
      console.log(t('reminder.restored', { loaded, expired }));
    }
  }

  /**
   * Create and schedule a new reminder.
   * Persisted immediately, then emits 'reminderDue' when the time comes.
   */
  async createReminder(
    userId: string,
    channelId: string,
    guildId: string,
    platform: Platform,
    message: string,
    dispatchTime: number,
    referenceMessageId?: string,
  ): Promise<Reminder> {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const reminder: Reminder = {
      id,
      userId,
      channelId,
      guildId,
      platform,
      message,
      dispatchTime,
      createdAt: now,
      ...(referenceMessageId !== undefined ? { referenceMessageId } : {}),
    };

    this.memoryStore.set(id, reminder);
    this.scheduleTimeout(reminder);

    // Fire-and-forget persistence — failures are logged but don't block the reply
    this.persistence.save(reminder).catch((err) =>
      console.error(t('reminder.failedPersist'), err),
    );

    return reminder;
  }

  /** Cancel a pending reminder by ID. Returns true if it existed. */
  async cancelReminder(id: string): Promise<boolean> {
    const timeout = this.timeouts.get(id);
    if (!timeout) return false;

    clearTimeout(timeout);
    this.timeouts.delete(id);
    this.memoryStore.delete(id);

    await this.persistence.delete(id).catch((err) =>
      console.error(t('reminder.failedDelete'), err),
    );
    return true;
  }

  /** Get a specific pending reminder by ID. */
  getReminder(id: string): Reminder | undefined {
    return this.memoryStore.get(id);
  }

  /** Get all pending reminders. */
  getAllReminders(): Reminder[] {
    return Array.from(this.memoryStore.values());
  }

  private scheduleTimeout(reminder: Reminder): void {
    const now = Math.floor(Date.now() / 1000);
    const delayMs = Math.max(0, (reminder.dispatchTime - now) * 1000);

    const timeout = setTimeout(() => {
      this.timeouts.delete(reminder.id);
      this.memoryStore.delete(reminder.id);
      this.fireReminder(reminder);
    }, delayMs);

    timeout.unref();
    this.timeouts.set(reminder.id, timeout);
  }

  private fireReminder(reminder: Reminder): void {
    // Remove from persistence first so a crash during emit doesn't cause duplicates
    this.persistence.delete(reminder.id).catch((err) =>
      console.error(t('reminder.failedCleanup'), err),
    );

    try {
      this.emit('reminderDue', { reminder });
    } catch (error) {
      console.error(t('reminder.dispatchError'), error);
    }
  }
}

export { ReminderService };

/**
 * Default singleton — picks the backend based on environment:
 *
 *   DATABASE_URL set → PostgreSQL (clustered / multi-instance)
 *   no DATABASE_URL  → SQLite (embedded, default)
 */
import { SqliteReminderStore } from './reminderStoreSqlite.js';
import { PostgresReminderStore } from './reminderStorePostgres.js';

const store = process.env.DATABASE_URL
  ? new PostgresReminderStore()
  : new SqliteReminderStore();

console.log(t('reminder.backend', { backend: process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite' }));

export const reminderService = new ReminderService(store);
