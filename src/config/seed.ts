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
  seeds: {
    directory: path.resolve(__dirname, '../../seeders'),
    extension: 'ts',
  },
});

async function run() {
  try {
    await db.seed.run();
    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

run();
