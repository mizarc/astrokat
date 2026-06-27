import { t } from '../../i18n.js';
import type { GuildSnapshotStore } from './guildSnapshotStore.js';
import type { GuildAggregator } from '../../types.js';

/**
 * Periodically records guild count and member total snapshots.
 *
 * It takes a `GuildAggregator` (which could be a Discord, Fluxer, or any
 * other adapter) and a `GuildSnapshotStore` (SQLite or Postgres). The
 * aggregator handles the complexity of sharding and platform-specific
 * cache structures.
 */
class GuildSnapshotService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: GuildSnapshotStore,
    private readonly aggregator: GuildAggregator
  ) {}

  /**
   * Start the snapshot interval.
   *
   * @param intervalMs How often to snapshot. Defaults to 1 hour.
   * @param immediate  If true, take the first snapshot right away.
   */
  start(intervalMs = 3_600_000, immediate = true): void {
    if (this.timer) {
      console.warn('[GUILD_SNAPSHOT] Already running — ignoring duplicate start.');
      return;
    }

    if (immediate) {
      this.snapshot();
    }

    this.timer = setInterval(() => this.snapshot(), intervalMs);
  }

  /** Stop the snapshot interval. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Manually trigger a snapshot (also used internally by the interval).
   */
  async snapshot(): Promise<void> {
    try {
      const stats = await this.aggregator.getStats();
      const recordedAt = Math.floor(Date.now() / 1000);

      await this.store.record({
        guildCount: stats.guildCount,
        memberTotal: stats.memberTotal,
        recordedAt,
      });

      console.log(
        t('guildSnapshot.recorded', {
          guilds: String(stats.guildCount),
          members: String(stats.memberTotal),
        })
      );
    } catch (error) {
      console.error(t('guildSnapshot.error'), error);
    }
  }
}

export { GuildSnapshotService };
