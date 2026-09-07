import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Normalize: ensure we always have a real Error
  const error = err instanceof Error ? err : new Error(String(err));

  // CORS errors — return 403, not 500
  if (error.message?.startsWith('CORS origin rejected:')) {
    res.status(403).json({
      status: 'error',
      message: 'Origin not allowed by CORS policy',
    });
    return;
  }

  if (error instanceof ValidationError && error.errors.length > 0) {
    res.status(error.statusCode).json({
      status: 'error',
      message: error.message,
      errors: error.errors,
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      status: 'error',
      message: error.message,
    });
    return;
  }

  logger.error('Unhandled error:', { error: error.message, stack: error.stack });

  // Never leak error details to the client in any environment
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
};
