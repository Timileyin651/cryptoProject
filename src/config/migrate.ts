import knex from 'knex';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const db = knex({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME || 'crypto_arbitrage',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },
  migrations: {
    directory: path.resolve(__dirname, '../../migrations'),
    extension: 'ts',
  },
});

const command = process.argv[2];

async function run() {
  try {
    if (command === '--undo') {
      const [batchNo, log] = await db.migrate.rollback();
      console.log(`Rolled back batch ${batchNo} (${log.length} migrations)`);
    } else {
      const [batchNo, log] = await db.migrate.latest();
      console.log(`Ran batch ${batchNo} (${log.length} migrations)`);
    }
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

run();
