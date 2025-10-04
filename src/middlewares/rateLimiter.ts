import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Demasiadas peticiones desde esta IP, intenta de nuevo más tarde',
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  message: 'Demasiados intentos de autenticación, intenta de nuevo en 15 minutos',
  skipSuccessfulRequests: true,
});

export const seatActionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10,
  message: 'Demasiadas acciones sobre asientos, espera un momento',
  keyGenerator: (req) => {
    // Rate limit por usuario autenticado
    return (req as any).user?.userId || req.ip;
  },
});
