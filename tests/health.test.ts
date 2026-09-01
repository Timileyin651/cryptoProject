import request from 'supertest';
import { app } from '../src/app';

describe('Health Endpoints', () => {
  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET / (home page)', () => {
    it('should return 200 and render HTML', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/html/);
      expect(response.text).toContain('Crypto Arbitrage Scanner');
    });
  });

  describe('GET /auth/register', () => {
    it('should return 200 and render register page', async () => {
      const response = await request(app).get('/auth/register');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/html/);
      expect(response.text).toContain('Create Account');
    });
  });

  describe('GET /auth/login', () => {
    it('should return 200 and render login page', async () => {
      const response = await request(app).get('/auth/login');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/html/);
      expect(response.text).toContain('Sign In');
    });
  });

  describe('GET /nonexistent', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/nonexistent');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('status', 'error');
    });
  });
});
