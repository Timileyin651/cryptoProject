import { Sequelize } from 'sequelize';
import { config } from './index';
import { logger } from '../utils/logger';

const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: config.db.dialect,
  logging: config.env === 'development' ? (msg) => logger.debug(msg) : false,
  pool: {
    min: config.db.pool.min,
    max: config.db.pool.max,
    acquire: config.db.pool.acquire,
    idle: config.db.pool.idle,
    // Evict stale connections every 5 seconds (default is 10s)
    evict: 5000,
  },
  // Retry failed queries (helps with transient MySQL errors)
  retry: {
    max: 3,
    timeout: 10000,
  },
  // Disable foreign key checks during sync (faster startup)
  dialectOptions: {
    // Connection timeout
    connectTimeout: 10000,
  },
  define: {
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    // Disable createdAt/updatedAt for read-heavy tables that don't need them
    paranoid: false,
  },
});

export const connectDatabase = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
  } catch (error) {
    logger.error('Unable to connect to database:', error);
    throw error;
  }
};

export const syncDatabase = async (): Promise<void> => {
  try {
    await sequelize.sync({ alter: config.env === 'development' });
    logger.info('Database models synchronized');
  } catch (error) {
    logger.error('Failed to sync database:', error);
    throw error;
  }
};

export { sequelize };
