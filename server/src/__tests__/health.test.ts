import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';

describe('Health Endpoints', () => {
  const app = createApp();

  describe('GET /health (Public)', () => {
    it('should return 200 and only { status: "ok" } on /health', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('should return 200 and only { status: "ok" } on /api/v1/health', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /health/detail (Internal Secured)', () => {
    it('should reject request without HEALTH_TOKEN with 401 Unauthorized', async () => {
      const res = await request(app).get('/health/detail');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject request with wrong HEALTH_TOKEN with 401 Unauthorized', async () => {
      const res = await request(app)
        .get('/health/detail')
        .set('x-health-token', 'wrong-token-12345');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should accept request with valid x-health-token header', async () => {
      const res = await request(app)
        .get('/health/detail')
        .set('x-health-token', env.HEALTH_TOKEN);

      // Either 200 (connected) or 503 (database offline in isolated unit test)
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('service', 'Cliently API Internal Health');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('services');
      expect(res.body).toHaveProperty('memory');
    });

    it('should accept request with valid Authorization Bearer header', async () => {
      const res = await request(app)
        .get('/health/detail')
        .set('Authorization', `Bearer ${env.HEALTH_TOKEN}`);

      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('service', 'Cliently API Internal Health');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('services');
    });
  });
});
