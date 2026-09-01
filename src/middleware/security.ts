import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { Router } from 'express';

export const securityMiddleware = (router: Router): void => {
  router.use(helmet());
  router.use(cors({ origin: config.cors.origin, credentials: true }));
  router.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { status: 'error', message: 'Too many requests, please try again later' },
    }),
  );
};
