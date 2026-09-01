import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('exchanges', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable().unique();
    table.string('slug', 50).notNullable().unique();
    table.string('api_base_url', 255).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('exchanges');
}
