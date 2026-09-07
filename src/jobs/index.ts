import { logger } from '../utils/logger';

export const startJobs = (): void => {
  logger.info('Job scheduler initialized (no jobs configured yet)');
};

export const stopJobs = (): void => {
  logger.info('Job scheduler stopped');
};
