import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Only seed if the table is empty
  const count = await knex('exchanges').count('* as count').first();
  if (count && Number(count.count) === 0) {
    console.log('Exchanges table is empty. Seed data will be added when exchange integrations are configured.');
  }
}
