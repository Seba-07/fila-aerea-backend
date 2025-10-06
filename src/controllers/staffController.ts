import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { User, Ticket } from '../models';
import { logger } from '../utils/logger';
import { EventLog } from '../models/EventLog';

// Registrar nuevo pasajero con tickets
export const registerPassenger = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { nombre, email, cantidad_tickets } = req.body;

    if (!nombre || !email || !cantidad_tickets) {
      res.status(400).json({
        error: 'Nombre, email y cantidad de tickets son obligatorios',
      });
      return;
    }

    if (cantidad_tickets < 1 || cantidad_tickets > 10) {
      res.status(400).json({
        error: 'La cantidad de tickets debe estar entre 1 y 10',
      });
      return;
    }

    // Verificar si el email ya existe
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(400).json({ error: 'El email ya está registrado' });
      return;
    }

    // Crear usuario
    const user = await User.create({
      nombre,
      email: email.toLowerCase(),
      verificado: true,
      rol: 'passenger',
    });

    // Crear tickets
    const tickets = [];
    for (let i = 1; i <= cantidad_tickets; i++) {
      const codigo_ticket = `TIX${Date.now()}${i}`.toUpperCase().slice(0, 12);
      tickets.push({
        userId: user._id,
        codigo_ticket,
        pasajeros: [],
        estado: 'disponible',
      });
    }

    const createdTickets = await Ticket.insertMany(tickets);

    await EventLog.create({
      type: 'passenger_registered',
      entity: 'user',
      entityId: String(user._id),
      userId: req.user?.userId,
      payload: {
        nombre,
        email,
        cantidad_tickets,
      },
    });

    res.json({
      message: 'Pasajero registrado exitosamente',
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
      },
      tickets: createdTickets.map((t) => ({
        id: t._id,
        codigo_ticket: t.codigo_ticket,
      })),
    });
  } catch (error: any) {
    logger.error('Error en registerPassenger:', error);
    res.status(500).json({ error: 'Error al registrar pasajero' });
  }
};

// Listar todos los pasajeros
export const getPassengers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const passengers = await User.find({ rol: 'passenger' }).sort({
      createdAt: -1,
    });

    const passengersWithTickets = await Promise.all(
      passengers.map(async (p) => {
        const ticketCount = await Ticket.countDocuments({
          userId: p._id,
          estado: { $in: ['disponible', 'asignado', 'inscrito'] },
        });

        return {
          id: p._id,
          nombre: p.nombre,
          email: p.email,
          tickets_disponibles: ticketCount,
        };
      })
    );

    res.json(passengersWithTickets);
  } catch (error: any) {
    logger.error('Error en getPassengers:', error);
    res.status(500).json({ error: 'Error al obtener pasajeros' });
  }
};
