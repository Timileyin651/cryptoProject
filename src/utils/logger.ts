import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { config } from '../config';
import { redactFormat } from './logRedaction';

const logDir = path.resolve(config.logging.dir);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      redactFormat(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${String(timestamp)} [${level}]: ${String(message)}${metaStr}`;
      }),
    ),
  }),
];

if (config.env === 'production') {
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        redactFormat(),
        winston.format.json(),
      ),
    }),
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      format: winston.format.combine(
        winston.format.timestamp(),
        redactFormat(),
        winston.format.json(),
      ),
    }),
  );
}

export const logger = winston.createLogger({
  level: config.logging.level,
  transports,
});
