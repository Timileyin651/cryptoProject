const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('refresh_tokens', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      token_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      family: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      is_revoked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      user_agent: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('refresh_tokens', ['user_id'], { name: 'idx_refresh_tokens_user' });
    // token_hash already has a unique index from the column definition
    await queryInterface.addIndex('refresh_tokens', ['family'], { name: 'idx_refresh_tokens_family' });
    await queryInterface.addIndex('refresh_tokens', ['expires_at'], { name: 'idx_refresh_tokens_expires' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('refresh_tokens');
  },
};
