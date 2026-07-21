/**
 * Schema migration infrastructure for Astrokat.
 *
 * Uses SQLite PRAGMA user_version and a Postgres schema_version table
 * to track which migrations have been applied. Runs sequentially at
 * startup before any store constructs.
 *
 * Migration 1 (0.3.0 -> 0.4.0): Table renames
 *   guild_tasks -> tasks
 *   guild_task_runs -> task_history
 *   guild_disabled_commands -> disabled_commands
 *   guild_features -> disabled_features
 *   guild_config -> guild_configs
 *   keyword_bonuses -> xp_bonuses
 *   join_roles -> role_joins
 *   level_roles -> role_levels
 *   pending_role_assignments -> role_join_queue
 *   reaction_roles -> role_reactions
 *   rep_daily_allowance -> rep_history
 *   rep_target_lockout -> rep_target_lockouts
 */

const SCHEMA_VERSION = 1;

export function getCurrentSchemaVersion(): number {
  return SCHEMA_VERSION;
}

/**
 * Run pending migrations on a SQLite database.
 * Uses PRAGMA user_version to track the current schema version.
 * @param dbPath - Path to the SQLite database file.
 */
export async function migrateSqlite(dbPath: string): Promise<void> {
  let db: any;
  try {
    const Database = (await import('better-sqlite3')).default;
    const { existsSync, mkdirSync } = await import('fs');
    const { dirname, resolve } = await import('path');

    const resolvedPath = resolve(dbPath);
    const dir = dirname(resolvedPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    db = new Database(resolvedPath);
    const currentVersion = db.pragma('user_version', { simple: true }) as number;

    if (currentVersion >= SCHEMA_VERSION) return;

    console.log(`[MIGRATE] SQLite schema v${currentVersion} → v${SCHEMA_VERSION}`);

    if (currentVersion < 1) {
      migrateV1Sqlite(db);
    }

    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    console.log('[MIGRATE] Done.');
  } finally {
    if (db) db.close();
  }
}

function migrateV1Sqlite(db: any): void {
  const renames: [string, string][] = [
    ['guild_tasks', 'tasks'],
    ['guild_task_runs', 'task_history'],
    ['guild_disabled_commands', 'disabled_commands'],
    ['guild_features', 'disabled_features'],
    ['guild_config', 'guild_configs'],
    ['keyword_bonuses', 'xp_bonuses'],
    ['join_roles', 'role_joins'],
    ['level_roles', 'role_levels'],
    ['pending_role_assignments', 'role_join_queue'],
    ['reaction_roles', 'role_reactions'],
    ['rep_daily_allowance', 'rep_history'],
    ['rep_target_lockout', 'rep_target_lockouts'],
  ];

  for (const [oldName, newName] of renames) {
    try {
      const exists = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(oldName);
      if (!exists) continue;

      // If the new table already exists (from a prior partial run), just drop the old one
      const newExists = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(newName);
      if (newExists) {
        db.exec(`DROP TABLE ${oldName}`);
        console.log(`Dropped old ${oldName} (new ${newName} already exists)`);
      } else {
        db.exec(`ALTER TABLE ${oldName} RENAME TO ${newName}`);
        console.log(`Renamed ${oldName} -> ${newName}`);
      }
    } catch (err: any) {
      console.warn(`Skipped ${oldName} -> ${newName}: ${err.message}`);
    }
  }

  // Clean up orphaned tables from previous dead-end migration attempts
  const orphans = ['rep_entries', 'role_queue', 'roles_queue', 'roles_join', 'roles_level', 'roles_reaction', 'roles_join_queue'];
  for (const orphan of orphans) {
    try {
      const exists = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(orphan);
      if (exists) {
        db.exec(`DROP TABLE ${orphan}`);
        console.log(`Cleaned up orphaned table ${orphan}`);
      }
    } catch { /* ignore */ }
  }
}

/**
 * Run pending migrations on a PostgreSQL database.
 * Uses a schema_version table to track the current schema version.
 * @param connectionString - PostgreSQL connection string.
 */
export async function migratePostgres(connectionString?: string): Promise<void> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: connectionString ?? process.env.DATABASE_URL,
    max: 1,
  });

  try {
    // Ensure the schema_version table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      )
    `);

    const result = await pool.query('SELECT version FROM schema_version LIMIT 1');
    const currentVersion = result.rows.length > 0 ? result.rows[0].version : 0;

    if (currentVersion >= SCHEMA_VERSION) return;

    console.log(`[MIGRATE] Postgres schema v${currentVersion} → v${SCHEMA_VERSION}`);

    if (currentVersion < 1) {
      await migrateV1Postgres(pool);
    }

    if (result.rows.length > 0) {
      await pool.query('UPDATE schema_version SET version = $1', [SCHEMA_VERSION]);
    } else {
      await pool.query('INSERT INTO schema_version (version) VALUES ($1)', [SCHEMA_VERSION]);
    }

    console.log('[MIGRATE] Done.');
  } finally {
    await pool.end();
  }
}

async function migrateV1Postgres(pool: any): Promise<void> {
  const renames: [string, string][] = [
    ['guild_tasks', 'tasks'],
    ['guild_task_runs', 'task_history'],
    ['guild_disabled_commands', 'disabled_commands'],
    ['guild_features', 'disabled_features'],
    ['guild_config', 'guild_configs'],
    ['keyword_bonuses', 'xp_bonuses'],
    ['join_roles', 'role_joins'],
    ['level_roles', 'role_levels'],
    ['pending_role_assignments', 'role_join_queue'],
    ['reaction_roles', 'role_reactions'],
    ['rep_daily_allowance', 'rep_history'],
    ['rep_target_lockout', 'rep_target_lockouts'],
  ];

  for (const [oldName, newName] of renames) {
    try {
      const oldResult = await pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables WHERE table_name = $1
        ) AS exists`,
        [oldName]
      );
      if (!oldResult.rows[0].exists) continue;

      // If the new table already exists, just drop the old one
      const newResult = await pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables WHERE table_name = $1
        ) AS exists`,
        [newName]
      );
      if (newResult.rows[0].exists) {
        await pool.query(`DROP TABLE ${oldName}`);
        console.log(`Dropped old ${oldName} (new ${newName} already exists)`);
      } else {
        await pool.query(`ALTER TABLE ${oldName} RENAME TO ${newName}`);
        console.log(`Renamed ${oldName} -> ${newName}`);
      }
    } catch (err: any) {
      console.warn(`Skipped ${oldName} -> ${newName}: ${err.message}`);
    }
  }
}
