import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('arbitrage_opportunities', (table) => {
    table.increments('id').primary();
    table.integer('buy_exchange_id').unsigned().notNullable()
      .references('id').inTable('exchanges').onDelete('CASCADE');
    table.integer('sell_exchange_id').unsigned().notNullable()
      .references('id').inTable('exchanges').onDelete('CASCADE');
    table.string('symbol', 20).notNullable();
    table.decimal('buy_price', 36, 18).notNullable();
    table.decimal('sell_price', 36, 18).notNullable();
    table.decimal('spread_pct', 10, 6).notNullable();
    table.timestamp('detected_at').notNullable().defaultTo(knex.fn.now());
    table.enum('status', ['detected', 'executed', 'expired']).notNullable().defaultTo('detected');
    table.timestamps(true, true);

    table.index(['status', 'detected_at'], 'idx_arbitrage_status_time');
    table.index(['symbol'], 'idx_arbitrage_symbol');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('arbitrage_opportunities');
}
