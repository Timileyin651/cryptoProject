import { query } from 'express-validator';

export const healthQueryValidator = [query('detailed').optional().isBoolean().toBoolean()];
