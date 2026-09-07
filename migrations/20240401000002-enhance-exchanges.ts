const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('exchanges', 'slug', {
      type: Sequelize.STRING(50),
      allowNull: false,
      unique: true,
      after: 'name',
    });

    await queryInterface.addColumn('exchanges', 'logo_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });

    await queryInterface.addColumn('exchanges', 'website_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });

    await queryInterface.addColumn('exchanges', 'supports_spot', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await queryInterface.addColumn('exchanges', 'supports_futures', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn('exchanges', 'supports_margin', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn('exchanges', 'supports_websocket', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn('exchanges', 'api_version', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });

    await queryInterface.addColumn('exchanges', 'rate_limit_per_minute', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 600,
    });

    await queryInterface.addColumn('exchanges', 'country', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    await queryInterface.addColumn('exchanges', 'trust_score', {
      type: Sequelize.DECIMAL(3, 1),
      allowNull: true,
      defaultValue: 5.0,
      comment: '0.0 - 10.0 trust score',
    });

    await queryInterface.addColumn('exchanges', 'metadata', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Arbitrary extra exchange properties',
    });

    await queryInterface.addIndex('exchanges', ['slug']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('exchanges', ['slug']);
    await queryInterface.removeColumn('exchanges', 'metadata');
    await queryInterface.removeColumn('exchanges', 'trust_score');
    await queryInterface.removeColumn('exchanges', 'country');
    await queryInterface.removeColumn('exchanges', 'rate_limit_per_minute');
    await queryInterface.removeColumn('exchanges', 'api_version');
    await queryInterface.removeColumn('exchanges', 'supports_websocket');
    await queryInterface.removeColumn('exchanges', 'supports_margin');
    await queryInterface.removeColumn('exchanges', 'supports_futures');
    await queryInterface.removeColumn('exchanges', 'supports_spot');
    await queryInterface.removeColumn('exchanges', 'website_url');
    await queryInterface.removeColumn('exchanges', 'logo_url');
    await queryInterface.removeColumn('exchanges', 'slug');
  },
};
