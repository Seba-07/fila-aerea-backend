import { Request, Response } from 'express';
import { User } from '../models';
import { generateToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { EventLog } from '../models/EventLog';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      res.status(400).json({ error: 'Email inválido' });
      return;
    }

    // Buscar usuario
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    // Generar JWT
    const token = generateToken({
      userId: String(user._id),
      email: user.email,
      rol: user.rol,
    });

    await EventLog.create({
      type: 'login',
      entity: 'user',
      entityId: String(user._id),
      userId: String(user._id),
      payload: { email },
    });

    // Enviar token en cookie y header
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    });

    res.json({
      token,
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        verificado: user.verificado,
      },
    });
  } catch (error: any) {
    logger.error('Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  res.clearCookie('token');
  res.json({ message: 'Sesión cerrada' });
};
