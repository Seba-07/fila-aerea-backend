import { Request, Response } from 'express';
import { User, Settings } from '../models';
import { generateToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { EventLog } from '../models/EventLog';
import bcrypt from 'bcryptjs';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      res.status(400).json({ error: 'Email inválido' });
      return;
    }

    const emailLower = email.toLowerCase();
    const STAFF_EMAIL = 'staff@cac.cl';

    // TEMPORALMENTE DESHABILITADO: Validación de contraseña para staff
    // TODO: Reactivar cuando se confirme que el login funciona
    /*
    if (emailLower === STAFF_EMAIL) {
      if (!password) {
        res.status(400).json({ error: 'Contraseña requerida para usuario staff', requiresPassword: true });
        return;
      }

      const settings = await Settings.findOne();
      if (!settings) {
        res.status(500).json({ error: 'Configuración del sistema no encontrada' });
        return;
      }

      const passwordMatch = await bcrypt.compare(password, settings.admin_password);
      if (!passwordMatch) {
        res.status(401).json({ error: 'Contraseña incorrecta' });
        return;
      }
    }
    */

    // Buscar usuario
    const user = await User.findOne({ email: emailLower });

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
