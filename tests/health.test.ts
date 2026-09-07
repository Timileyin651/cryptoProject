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

  describe('GET /health/live', () => {
    it('should return 200 with status ok and timestamp', async () => {
      const response = await request(app).get('/health/live');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('GET /nonexistent', () => {
    it('should return 404 for unknown routes outside API prefix', async () => {
      const response = await request(app).get('/some-completely-fake-route-xyz');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('status', 'error');
    });
  });
});
