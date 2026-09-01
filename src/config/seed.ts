/**
 * Seed runner — uses sequelize-cli via the package.json "seed" script.
 *
 * If you need custom seeding logic, run the seeders directly:
 *   npx sequelize-cli db:seed:all
 *
 * This file is kept as a convenience wrapper so `npm run seed` still works.
 */
import { execSync } from 'child_process';

try {
  execSync('npx sequelize-cli db:seed:all', { stdio: 'inherit' });
} catch {
  process.exit(1);
}
