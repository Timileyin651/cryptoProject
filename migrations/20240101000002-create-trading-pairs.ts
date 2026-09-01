import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('trading_pairs', (table) => {
    table.increments('id').primary();
    table.integer('exchange_id').unsigned().notNullable()
      .references('id').inTable('exchanges').onDelete('CASCADE');
    table.string('symbol', 20).notNullable();
    table.string('base_currency', 10).notNullable();
    table.string('quote_currency', 10).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.index(['exchange_id', 'symbol'], 'idx_trading_pairs_exchange_symbol');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('trading_pairs');
}
