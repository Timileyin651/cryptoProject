import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 255).notNullable().unique();
    table.string('family', 50).notNullable().index();
    table.boolean('is_revoked').notNullable().defaultTo(false);
    table.timestamp('expires_at').notNullable();
    table.string('user_agent', 500).nullable();
    table.timestamps(true, true);

    table.index(['user_id', 'is_revoked']);
    table.index('expires_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_tokens');
}
