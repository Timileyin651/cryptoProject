import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('price_snapshots', (table) => {
    table.increments('id').primary();
    table.integer('trading_pair_id').unsigned().notNullable()
      .references('id').inTable('trading_pairs').onDelete('CASCADE');
    table.decimal('bid_price', 36, 18).notNullable();
    table.decimal('ask_price', 36, 18).notNullable();
    table.decimal('volume_24h', 36, 18).notNullable().defaultTo(0);
    table.timestamp('fetched_at').notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.index(['trading_pair_id', 'fetched_at'], 'idx_price_snapshots_pair_time');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('price_snapshots');
}
