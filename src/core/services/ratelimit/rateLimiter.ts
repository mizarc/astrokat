import { t } from '../../i18n.js';

/**
 * Sliding-window rate limiter with three-tier limit resolution.
 *
 * Limits are resolved at runtime using this priority order (highest first):
 *   1. Per-guild database override (from `GuildConfigStore`)
 *   2. Runtime global override (set by bot operators via command)
 *   3. Environment variable defaults (lowest priority)
 *
 * Environment variables:
 *   `RATE_LIMIT_USER_MAX` — Max commands per user per window (default: 10)
 *   `RATE_LIMIT_GUILD_MAX` — Max commands per guild per window (default: 100)
 *   `RATE_LIMIT_WINDOW_MS` — Sliding window duration in ms  (default: 60000)
 */

/**
 * Rate limit configuration used by the sliding window.
 *
 * All values can be overridden via environment variables at startup,
 * then optionally overridden at runtime through the override tiers.
 */
interface RateLimitConfig {
  /** Max commands a single user can execute per guild within the window. */
  userMaxCommands: number;

  /** Max commands the entire guild can execute within the window. */
  guildMaxCommands: number;

  /** Sliding time window in milliseconds. */
  windowMs: number;
}

/**
 * Load the default rate limit configuration from environment variables.
 *
 * Reads `RATE_LIMIT_USER_MAX`, `RATE_LIMIT_GUILD_MAX`, and
 * `RATE_LIMIT_WINDOW_MS`. Falls back to safe defaults when unset.
 */
function loadConfig(): RateLimitConfig {
  return {
    userMaxCommands: parseInt(process.env.RATE_LIMIT_USER_MAX ?? '10', 10),
    guildMaxCommands: parseInt(process.env.RATE_LIMIT_GUILD_MAX ?? '100', 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  };
}

/**
 * Per-guild rate limit overrides resolved by the provider function.
 *
 * Any field set to `null` means "no override — fall through to the next
 * tier. An empty object `{}` keeps both defaults.
 */
export interface GuildRateLimitOverride {
  userMaxCommands?: number | null;
  guildMaxCommands?: number | null;
}

/**
 * Async function provided at startup that returns per-guild overrides.
 * Typically wired to `GuildConfigStore.get()` by the router.
 *
 * Return `null` or an empty object to rely on env var / global-override
 * defaults.
 */
export type GuildRateLimitProvider = (guildId: string) => Promise<GuildRateLimitOverride | null>;

/**
 * Sliding-window rate limiter for Discord/Fluxer bot commands.
 *
 * Tracks two tiers of buckets:
 * - **Per-user-per-guild**: limits how often an individual can issue commands.
 * - **Per-guild**: limits total command volume for the entire server.
 *
 * Buckets are arrays of Unix timestamps (ms). Old entries outside the
 * configured window are pruned on every check. Stale buckets are cleaned
 * up by a periodic timer to prevent memory leaks.
 */
class RateLimiter {
  /**
   * Per-user-per-guild buckets.
   * Key: `${guildId}:${userId}` → array of recent command timestamps.
   */
  private userBuckets = new Map<string, number[]>();

  /**
   * Per-guild buckets.
   * Key: `guildId` → array of recent command timestamps.
   */
  private guildBuckets = new Map<string, number[]>();

  /** Handle for the periodic stale-entry cleanup interval. */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** The resolved rate limit configuration (env defaults + ctor overrides). */
  private config: RateLimitConfig;

  /** Callback for looking up per-guild overrides. Set once at startup. */
  private guildConfigProvider: GuildRateLimitProvider | null = null;

  /**
   * Runtime platform-wide overrides, applied on top of env vars.
   * Set via `setGlobalOverride()` — persists until cleared or process restart.
   * Per-guild DB values (tier 1) still take precedence over these.
   */
  private globalOverride: { userMaxCommands: number | null; guildMaxCommands: number | null } = {
    userMaxCommands: null,
    guildMaxCommands: null,
  };

  /**
   * @param config - Partial config to merge over environment variable defaults.
   *   Useful in tests to override specific values without touching env vars.
   */
  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...loadConfig(), ...config };
    console.log(
      `[RATE-LIMIT] User: ${this.config.userMaxCommands} cmd/${this.config.windowMs}ms, ` +
        `Guild: ${this.config.guildMaxCommands} cmd/${this.config.windowMs}ms`
    );

    // Periodically purge stale map entries to prevent memory leaks.
    // Runs every 5 minutes regardless of the configured window.
    this.cleanupTimer = setInterval(() => this.cleanup(), 300_000);
    this.cleanupTimer.unref();
  }

  /**
   * Register the per-guild config provider callback.
   *
   * Called once at startup from the router, wiring this limiter to the
   * `GuildConfigStore` for database-backed per-guild overrides.
   */
  setGuildConfigProvider(provider: GuildRateLimitProvider): void {
    this.guildConfigProvider = provider;
    console.log('[RATE-LIMIT] Guild config provider registered.');
  }

  /**
   * Override rate limits at the bot-operator level.
   *
   * Pass `null` for either value to leave the current effective value
   * unchanged for that field (falls through to env-var default).
   * Per-guild DB overrides (tier 1) still take precedence.
   *
   * Takes effect immediately — no restart needed.
   * Intended for use by a bot-operator command, not exposed to end users.
   */
  setGlobalOverride(userMax: number | null, guildMax: number | null): void {
    this.globalOverride = { userMaxCommands: userMax, guildMaxCommands: guildMax };
    const user = userMax ?? 'default';
    const guild = guildMax ?? 'default';
    console.log(`[RATE-LIMIT] Global override set — user: ${user}, guild: ${guild}`);
  }

  /**
   * Return a copy of the current global override values.
   * `null` means "not set" — the env-var default remains in use.
   */
  getGlobalOverride(): { userMaxCommands: number | null; guildMaxCommands: number | null } {
    return { ...this.globalOverride };
  }

  /**
   * Return the effective defaults that apply when no per-guild DB
   * override is set. This is the cap that per-guild overrides
   * should not exceed.
   *
   * Priority: global override (if set) ** env default (fallback).
   */
  getEffectiveDefaults(): { userMaxCommands: number; guildMaxCommands: number } {
    return {
      userMaxCommands: this.globalOverride.userMaxCommands ?? this.config.userMaxCommands,
      guildMaxCommands: this.globalOverride.guildMaxCommands ?? this.config.guildMaxCommands,
    };
  }

  /**
   * Remove the global override, reverting both user and guild limits
   * to their environment variable defaults (or per-guild DB overrides).
   */
  clearGlobalOverride(): void {
    this.globalOverride = { userMaxCommands: null, guildMaxCommands: null };
    console.log('[RATE-LIMIT] Global override cleared.');
  }

  /**
   * Resolve the effective rate limits for a guild by merging three tiers.
   *
   * Resolution order (highest priority wins):
   *   1. Per-guild DB override from the provider callback
   *   2. Runtime platform-wide override set by bot operator
   *   3. Environment variable defaults (lowest priority)
   *
   * @param guildId - The guild to resolve limits for.
   * @returns The resolved `userMax` and `guildMax` counts.
   */
  private async resolveGuildLimits(
    guildId: string
  ): Promise<{ userMax: number; guildMax: number }> {
    // Start with env-var defaults
    let userMax = this.config.userMaxCommands;
    let guildMax = this.config.guildMaxCommands;

    // Apply runtime global override (tier 2)
    if (this.globalOverride.userMaxCommands != null) userMax = this.globalOverride.userMaxCommands;
    if (this.globalOverride.guildMaxCommands != null)
      guildMax = this.globalOverride.guildMaxCommands;

    // Apply per-guild DB override (tier 1 — highest priority)
    if (this.guildConfigProvider) {
      try {
        const override = await this.guildConfigProvider(guildId);
        if (override) {
          if (override.userMaxCommands != null) userMax = override.userMaxCommands;
          if (override.guildMaxCommands != null) guildMax = override.guildMaxCommands;
        }
      } catch {
        // Provider failure — fall through silently
      }
    }

    return { userMax, guildMax };
  }

  /**
   * Prune expired timestamps from a bucket, keeping only entries that fall
   * within the current sliding window.
   *
   * @param bucket - Array of timestamps to filter.
   * @returns A new array containing only entries newer than `now - windowMs`.
   */
  private prune(bucket: number[]): number[] {
    const cutoff = Date.now() - this.config.windowMs;
    return bucket.filter((ts) => ts > cutoff);
  }

  /**
   * Check and record a command attempt against the rate limits.
   *
   * Evaluation order:
   *   1. Resolve effective limits via the three-tier override system.
   *   2. Check the **guild-level** limit first (harder global cap).
   *   3. Check the **user-level** limit second.
   *   4. If both pass, record the command timestamps and allow.
   *
   * @param guildId - The guild the command was issued in.
   * @param userId  - The user who issued the command.
   * @returns `{ allowed: true }` if the command passes both limits.
   *   `{ allowed: false, retryAfter, reason }` with the cooldown duration
   *   (in ms) and which limit was hit (`'user'` or `'guild'`).
   */
  async check(
    guildId: string,
    userId: string
  ): Promise<{ allowed: true } | { allowed: false; retryAfter: number; reason: 'user' | 'guild' }> {
    const now = Date.now();
    const { userMax, guildMax } = await this.resolveGuildLimits(guildId);

    // Guild-level check
    const guildKey = guildId;
    let guildBucket = this.guildBuckets.get(guildKey) ?? [];
    guildBucket = this.prune(guildBucket);

    if (guildBucket.length >= guildMax && guildBucket.length > 0) {
      const oldest = guildBucket[0]!;
      const retryAfter = oldest + this.config.windowMs - now;
      return { allowed: false, retryAfter: Math.ceil(retryAfter), reason: 'guild' };
    }

    // User-level check
    const userKey = `${guildId}:${userId}`;
    let userBucket = this.userBuckets.get(userKey) ?? [];
    userBucket = this.prune(userBucket);

    if (userBucket.length >= userMax && userBucket.length > 0) {
      const oldest = userBucket[0]!;
      const retryAfter = oldest + this.config.windowMs - now;
      return { allowed: false, retryAfter: Math.ceil(retryAfter), reason: 'user' };
    }

    // Record the command
    guildBucket.push(now);
    this.guildBuckets.set(guildKey, guildBucket);

    userBucket.push(now);
    this.userBuckets.set(userKey, userBucket);

    return { allowed: true };
  }

  /**
   * Periodic cleanup that removes stale entries from both bucket maps.
   *
   * Entries whose all timestamps have fallen outside the sliding window
   * are deleted entirely. Partially expired buckets are pruned in place.
   *
   * Called automatically every 5 minutes via the cleanup interval set
   * up in the constructor.
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.config.windowMs;

    for (const [key, bucket] of this.guildBuckets) {
      const remaining = bucket.filter((ts) => ts > cutoff);
      if (remaining.length === 0) {
        this.guildBuckets.delete(key);
      } else {
        this.guildBuckets.set(key, remaining);
      }
    }

    for (const [key, bucket] of this.userBuckets) {
      const remaining = bucket.filter((ts) => ts > cutoff);
      if (remaining.length === 0) {
        this.userBuckets.delete(key);
      } else {
        this.userBuckets.set(key, remaining);
      }
    }
  }

  /**
   * Reset all in-memory rate limit state.
   *
   * Clears both user and guild buckets without affecting config,
   * the cleanup timer, or any registered providers.
   * Intended for test teardown between test cases.
   */
  reset(): void {
    this.userBuckets.clear();
    this.guildBuckets.clear();
  }

  /**
   * Dispose of the rate limiter's internal timer.
   *
   * Stops the periodic cleanup interval. Call this during test
   * teardown (e.g. `afterAll`) to prevent dangling handles, or
   * when shutting down the bot cleanly.
   *
   * After disposal, `check()` still works but stale buckets will
   * no longer be cleaned up automatically.
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export const rateLimiter = new RateLimiter();
export { RateLimiter };
export type { RateLimitConfig };
