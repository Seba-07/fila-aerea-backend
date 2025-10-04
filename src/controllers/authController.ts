import { Request, Response } from 'express';
import { User, Verification } from '../models';
import { emailService } from '../services/emailService';
import { generateToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { EventLog } from '../models/EventLog';

// Genera código OTP de 6 dígitos
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const requestOTP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      res.status(400).json({ error: 'Email inválido' });
      return;
    }

    const code = generateOTP();

    // Guardar código en DB
    await Verification.create({
      email: email.toLowerCase(),
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    });

    // Enviar email
    await emailService.sendOTP(email, code);

    await EventLog.create({
      type: 'otp_request',
      entity: 'verification',
      payload: { email },
    });

    res.json({ message: 'Código enviado al email', email });
  } catch (error: any) {
    logger.error('Error en requestOTP:', error);
    res.status(500).json({ error: 'Error al enviar código' });
  }
};

export const verifyOTP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code, nombre } = req.body;

    if (!email || !code) {
      res.status(400).json({ error: 'Email y código son obligatorios' });
      return;
    }

    // Buscar verificación válida
    const verification = await Verification.findOne({
      email: email.toLowerCase(),
      code,
      expiresAt: { $gt: new Date() },
    });

    if (!verification) {
      res.status(401).json({ error: 'Código inválido o expirado' });
      return;
    }

    // Buscar o crear usuario
    let user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      if (!nombre) {
        res.status(400).json({ error: 'El nombre es obligatorio para nuevos usuarios' });
        return;
      }

      user = await User.create({
        nombre,
        email: email.toLowerCase(),
        verificado: true,
        rol: 'passenger',
      });

      await EventLog.create({
        type: 'user_created',
        entity: 'user',
        entityId: user._id.toString(),
        payload: { email, nombre },
      });
    } else if (!user.verificado) {
      user.verificado = true;
      await user.save();
    }

    // Eliminar verificación usada
    await Verification.deleteOne({ _id: verification._id });

    // Generar JWT
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      rol: user.rol,
    });

    await EventLog.create({
      type: 'login',
      entity: 'user',
      entityId: user._id.toString(),
      userId: user._id.toString(),
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
    logger.error('Error en verifyOTP:', error);
    res.status(500).json({ error: 'Error al verificar código' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  res.clearCookie('token');
  res.json({ message: 'Sesión cerrada' });
};
