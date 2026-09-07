import {
  AppError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from '../../src/utils/errors';

describe('Error classes', () => {
  describe('AppError', () => {
    it('creates an error with status code', () => {
      const err = new AppError('test', 500);
      expect(err.message).toBe('test');
      expect(err.statusCode).toBe(500);
      expect(err.isOperational).toBe(true);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
    });

    it('defaults isOperational to true', () => {
      const err = new AppError('test', 500);
      expect(err.isOperational).toBe(true);
    });

    it('can set isOperational to false', () => {
      const err = new AppError('system error', 500, false);
      expect(err.isOperational).toBe(false);
    });
  });

  describe('NotFoundError', () => {
    it('has status 404 and default message', () => {
      const err = new NotFoundError();
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe('Resource not found');
    });

    it('accepts custom message', () => {
      const err = new NotFoundError('User not found');
      expect(err.message).toBe('User not found');
      expect(err.statusCode).toBe(404);
    });

    it('is instanceof AppError', () => {
      expect(new NotFoundError()).toBeInstanceOf(AppError);
    });
  });

  describe('BadRequestError', () => {
    it('has status 400', () => {
      const err = new BadRequestError();
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Bad request');
    });
  });

  describe('UnauthorizedError', () => {
    it('has status 401', () => {
      const err = new UnauthorizedError();
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Unauthorized');
    });
  });

  describe('ForbiddenError', () => {
    it('has status 403', () => {
      const err = new ForbiddenError();
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe('Forbidden');
    });
  });

  describe('ConflictError', () => {
    it('has status 409', () => {
      const err = new ConflictError();
      expect(err.statusCode).toBe(409);
      expect(err.message).toBe('Conflict');
    });
  });

  describe('ValidationError', () => {
    it('has status 422 and error array', () => {
      const errors = [{ field: 'email', message: 'Invalid' }];
      const err = new ValidationError('Validation failed', errors);
      expect(err.statusCode).toBe(422);
      expect(err.errors).toEqual(errors);
    });

    it('defaults to empty errors array', () => {
      const err = new ValidationError();
      expect(err.errors).toEqual([]);
    });
  });

  describe('instanceof checks', () => {
    it('all subclasses are instanceof AppError', () => {
      expect(new NotFoundError()).toBeInstanceOf(AppError);
      expect(new BadRequestError()).toBeInstanceOf(AppError);
      expect(new UnauthorizedError()).toBeInstanceOf(AppError);
      expect(new ForbiddenError()).toBeInstanceOf(AppError);
      expect(new ConflictError()).toBeInstanceOf(AppError);
      expect(new ValidationError()).toBeInstanceOf(AppError);
    });

    it('subclasses are NOT instances of each other', () => {
      expect(new NotFoundError()).not.toBeInstanceOf(BadRequestError);
      expect(new BadRequestError()).not.toBeInstanceOf(NotFoundError);
    });
  });

  describe('stack trace', () => {
    it('captures stack trace', () => {
      const err = new AppError('test', 500);
      expect(err.stack).toBeDefined();
      expect(err.stack).toContain('test');
    });
  });
});
