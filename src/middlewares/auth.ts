import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Buscar token en header o cookie
    let token = req.headers.authorization?.replace('Bearer ', '');

    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      res.status(401).json({ error: 'Token no proporcionado' });
      return;
    }

    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    logger.error('Error de autenticación:', error);
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    if (!roles.includes(req.user.rol)) {
      res.status(403).json({ error: 'Permisos insuficientes' });
      return;
    }

    next();
  };
};

export const requireStaff = requireRole('staff', 'admin');
export const requireAdmin = requireRole('admin');
