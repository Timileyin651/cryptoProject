/**
 * Migration runner.
 *
 * Can be invoked via:
 *   npm run migrate          — run pending migrations
 *   npm run migrate:undo     — undo the last migration
 *
 * Also imported by server.ts to auto-migrate on startup in production.
 */
import { execSync } from 'child_process';
import { config } from './index';
import { logger } from '../utils/logger';

export async function runMigrations(): Promise<void> {
  if (config.env === 'test') {
    logger.info('[Migrate] Skipping migrations in test environment');
    return;
  }

  logger.info('[Migrate] Running pending database migrations...');

  try {
    execSync('npx sequelize-cli db:migrate', {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: config.env,
      },
    });
    logger.info('[Migrate] Database migrations completed successfully');
  } catch (error) {
    logger.error('[Migrate] Database migration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function undoLastMigration(): Promise<void> {
  logger.info('[Migrate] Undoing last migration...');

  try {
    execSync('npx sequelize-cli db:migrate:undo', {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: config.env,
      },
    });
    logger.info('[Migrate] Last migration undone successfully');
  } catch (error) {
    logger.error('[Migrate] Undo failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Allow running directly: npx ts-node src/config/migrate.ts [--undo]
if (require.main === module) {
  const undo = process.argv.includes('--undo');
  const fn = undo ? undoLastMigration : runMigrations;
  fn()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
