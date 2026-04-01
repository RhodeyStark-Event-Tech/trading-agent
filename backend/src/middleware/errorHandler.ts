import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

// Wraps async route handlers to forward errors to the centralized error handler
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Centralized error handler — must be registered last
export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  logger.error({ err }, 'Unhandled error');

  const isProduction = process.env['NODE_ENV'] === 'production';
  res.status(500).json({
    success: false,
    error: isProduction ? 'Internal server error' : err.message ?? 'Internal server error',
  });
};
