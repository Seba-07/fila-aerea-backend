import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/auth';
import { Verification, User } from '../models';

// Mock de servicios
jest.mock('../services/emailService');
jest.mock('../models');

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/request-otp', () => {
    it('debe solicitar OTP con email válido', async () => {
      (Verification.create as jest.Mock).mockResolvedValue({
        email: 'test@test.com',
        code: '123456',
      });

      const res = await request(app).post('/auth/request-otp').send({
        email: 'test@test.com',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(Verification.create).toHaveBeenCalled();
    });

    it('debe rechazar email inválido', async () => {
      const res = await request(app).post('/auth/request-otp').send({
        email: 'invalid',
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /auth/verify-otp', () => {
    it('debe verificar código correcto y crear JWT', async () => {
      const mockUser = {
        _id: 'user123',
        nombre: 'Test User',
        email: 'test@test.com',
        rol: 'passenger',
        verificado: true,
      };

      (Verification.findOne as jest.Mock).mockResolvedValue({
        email: 'test@test.com',
        code: '123456',
        expiresAt: new Date(Date.now() + 10000),
        _id: 'ver123',
      });

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (Verification.deleteOne as jest.Mock).mockResolvedValue({});

      const res = await request(app).post('/auth/verify-otp').send({
        email: 'test@test.com',
        code: '123456',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
    });

    it('debe rechazar código inválido', async () => {
      (Verification.findOne as jest.Mock).mockResolvedValue(null);

      const res = await request(app).post('/auth/verify-otp').send({
        email: 'test@test.com',
        code: '000000',
      });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });
});
