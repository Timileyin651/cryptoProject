import { QueryInterface, DataTypes } from 'sequelize';

export default {
  async up(queryInterface: QueryInterface): Promise<void> {
    // ── favorite_coins ──
    await queryInterface.createTable('favorite_coins', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      coin_symbol: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Coin symbol, e.g. BTC, ETH',
      },
      coin_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex('favorite_coins', ['user_id', 'coin_symbol'], {
      unique: true,
      name: 'idx_favorite_coins_user_coin',
    });
    await queryInterface.addIndex('favorite_coins', ['user_id', 'sort_order'], {
      name: 'idx_favorite_coins_user_sort',
    });

    // ── favorite_exchanges ──
    await queryInterface.createTable('favorite_exchanges', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      exchange_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'exchanges', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex('favorite_exchanges', ['user_id', 'exchange_id'], {
      unique: true,
      name: 'idx_favorite_exchanges_user_exchange',
    });
    await queryInterface.addIndex('favorite_exchanges', ['user_id', 'sort_order'], {
      name: 'idx_favorite_exchanges_user_sort',
    });

    // ── watchlists ──
    await queryInterface.createTable('watchlists', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      is_default: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      item_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex('watchlists', ['user_id', 'name'], {
      unique: true,
      name: 'idx_watchlists_user_name',
    });
    await queryInterface.addIndex('watchlists', ['user_id', 'sort_order'], {
      name: 'idx_watchlists_user_sort',
    });

    // ── watchlist_items ──
    await queryInterface.createTable('watchlist_items', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      watchlist_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'watchlists', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      opportunity_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'opportunity_records', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      alert_above: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: true,
      },
      alert_below: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex('watchlist_items', ['watchlist_id', 'opportunity_id'], {
      unique: true,
      name: 'idx_watchlist_items_unique',
    });
    await queryInterface.addIndex('watchlist_items', ['watchlist_id', 'sort_order'], {
      name: 'idx_watchlist_items_sort',
    });
    await queryInterface.addIndex('watchlist_items', ['opportunity_id'], {
      name: 'idx_watchlist_items_opportunity',
    });
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.dropTable('watchlist_items');
    await queryInterface.dropTable('watchlists');
    await queryInterface.dropTable('favorite_exchanges');
    await queryInterface.dropTable('favorite_coins');
  },
};
