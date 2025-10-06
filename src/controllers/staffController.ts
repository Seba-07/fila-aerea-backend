import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { User, Ticket, Payment } from '../models';
import { logger } from '../utils/logger';
import { EventLog } from '../models/EventLog';

// Registrar nuevo pasajero con tickets y pago
export const registerPassenger = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { nombre, email, cantidad_tickets, metodo_pago, monto } = req.body;

    if (!nombre || !email || !cantidad_tickets || !metodo_pago || monto === undefined) {
      res.status(400).json({
        error: 'Nombre, email, cantidad de tickets, método de pago y monto son obligatorios',
      });
      return;
    }

    if (cantidad_tickets < 1 || cantidad_tickets > 10) {
      res.status(400).json({
        error: 'La cantidad de tickets debe estar entre 1 y 10',
      });
      return;
    }

    if (!['transferencia', 'tarjeta', 'efectivo'].includes(metodo_pago)) {
      res.status(400).json({
        error: 'Método de pago inválido',
      });
      return;
    }

    if (monto < 0) {
      res.status(400).json({
        error: 'El monto debe ser mayor o igual a 0',
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

    // Registrar pago
    await Payment.create({
      userId: user._id,
      monto,
      metodo_pago,
      cantidad_tickets,
    });

    await EventLog.create({
      type: 'passenger_registered',
      entity: 'user',
      entityId: String(user._id),
      userId: req.user?.userId,
      payload: {
        nombre,
        email,
        cantidad_tickets,
        metodo_pago,
        monto,
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
        const tickets = await Ticket.find({
          userId: p._id,
        });

        return {
          id: p._id,
          nombre: p.nombre,
          email: p.email,
          tickets_count: tickets.length,
          tickets: tickets.map(t => ({
            id: t._id,
            codigo_ticket: t.codigo_ticket,
            estado: t.estado,
            pasajeros: t.pasajeros,
          })),
        };
      })
    );

    res.json(passengersWithTickets);
  } catch (error: any) {
    logger.error('Error en getPassengers:', error);
    res.status(500).json({ error: 'Error al obtener pasajeros' });
  }
};

// Editar cantidad de tickets de un pasajero
export const updatePassengerTickets = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { passengerId } = req.params;
    const { cantidad_tickets } = req.body;

    if (!cantidad_tickets || cantidad_tickets < 0 || cantidad_tickets > 20) {
      res.status(400).json({
        error: 'La cantidad de tickets debe estar entre 0 y 20',
      });
      return;
    }

    const user = await User.findById(passengerId);
    if (!user || user.rol !== 'passenger') {
      res.status(404).json({ error: 'Pasajero no encontrado' });
      return;
    }

    const currentTickets = await Ticket.find({ userId: passengerId });
    const currentCount = currentTickets.length;

    if (cantidad_tickets > currentCount) {
      // Agregar tickets
      const ticketsToAdd = cantidad_tickets - currentCount;
      const newTickets = [];
      for (let i = 1; i <= ticketsToAdd; i++) {
        const codigo_ticket = `TIX${Date.now()}${i}`.toUpperCase().slice(0, 12);
        newTickets.push({
          userId: passengerId,
          codigo_ticket,
          pasajeros: [],
          estado: 'disponible',
        });
      }
      await Ticket.insertMany(newTickets);
    } else if (cantidad_tickets < currentCount) {
      // Eliminar tickets disponibles
      const ticketsToRemove = currentCount - cantidad_tickets;
      const availableTickets = currentTickets.filter(t => t.estado === 'disponible');

      if (availableTickets.length < ticketsToRemove) {
        res.status(400).json({
          error: `No hay suficientes tickets disponibles para eliminar. Solo ${availableTickets.length} tickets están disponibles.`,
        });
        return;
      }

      const ticketIdsToRemove = availableTickets.slice(0, ticketsToRemove).map(t => t._id);
      await Ticket.deleteMany({ _id: { $in: ticketIdsToRemove } });
    }

    res.json({ message: 'Tickets actualizados exitosamente' });
  } catch (error: any) {
    logger.error('Error en updatePassengerTickets:', error);
    res.status(500).json({ error: 'Error al actualizar tickets' });
  }
};

// Obtener historial de pagos
export const getPayments = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const payments = await Payment.find()
      .populate('userId', 'nombre email')
      .sort({ createdAt: -1 });

    const paymentsFormatted = payments.map(p => ({
      id: p._id,
      usuario: {
        id: (p.userId as any)._id,
        nombre: (p.userId as any).nombre,
        email: (p.userId as any).email,
      },
      monto: p.monto,
      metodo_pago: p.metodo_pago,
      cantidad_tickets: p.cantidad_tickets,
      fecha: p.fecha,
    }));

    const totalRecaudado = payments.reduce((sum, p) => sum + p.monto, 0);

    res.json({
      payments: paymentsFormatted,
      total_recaudado: totalRecaudado,
    });
  } catch (error: any) {
    logger.error('Error en getPayments:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
};
