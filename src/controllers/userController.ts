import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { User, Ticket } from '../models';
import { logger } from '../utils/logger';

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    // Obtener todos los tickets del usuario
    const tickets = await Ticket.find({
      userId: user._id,
      estado: { $in: ['disponible', 'asignado', 'inscrito'] },
    }).sort({ createdAt: 1 });

    res.json({
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        phone: user.phone,
        rol: user.rol,
        verificado: user.verificado,
      },
      tickets: tickets.map((t) => ({
        id: t._id,
        codigo_ticket: t.codigo_ticket,
        pasajeros: t.pasajeros,
        flightId: t.flightId,
        estado: t.estado,
      })),
    });
  } catch (error: any) {
    logger.error('Error en getMe:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
};

export const updateTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const { pasajeros, flightId } = req.body;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    const oldFlightId = ticket.flightId;

    // Actualizar campos
    if (pasajeros) {
      ticket.pasajeros = pasajeros;
    }

    if (flightId !== undefined) {
      // Si se está cambiando de vuelo, decrementar el vuelo anterior
      if (oldFlightId && oldFlightId.toString() !== flightId) {
        const { Flight } = await import('../models');
        await Flight.findByIdAndUpdate(oldFlightId, {
          $inc: { asientos_ocupados: -1 }
        });
      }

      ticket.flightId = flightId;

      // Si se asigna un vuelo y hay pasajeros, cambiar estado a asignado e incrementar asientos
      if (flightId && ticket.pasajeros && ticket.pasajeros.length > 0) {
        ticket.estado = 'asignado';

        // Incrementar asientos ocupados del nuevo vuelo (solo si es un cambio nuevo)
        if (!oldFlightId || oldFlightId.toString() !== flightId) {
          const { Flight } = await import('../models');
          await Flight.findByIdAndUpdate(flightId, {
            $inc: { asientos_ocupados: 1 }
          });
        }
      }
    }

    await ticket.save();

    res.json({ message: 'Ticket actualizado exitosamente', ticket });
  } catch (error: any) {
    logger.error('Error en updateTicket:', error);
    res.status(500).json({ error: 'Error al actualizar ticket' });
  }
};

export const removePassengerFromFlight = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    const flightId = ticket.flightId;

    // Decrementar asientos ocupados del vuelo
    if (flightId) {
      const { Flight } = await import('../models');
      await Flight.findByIdAndUpdate(flightId, {
        $inc: { asientos_ocupados: -1 }
      });
    }

    // Remover vuelo del ticket y cambiar estado
    ticket.flightId = undefined;
    ticket.estado = 'disponible';
    await ticket.save();

    res.json({ message: 'Pasajero removido del vuelo exitosamente', ticket });
  } catch (error: any) {
    logger.error('Error en removePassengerFromFlight:', error);
    res.status(500).json({ error: 'Error al remover pasajero del vuelo' });
  }
};

// Aceptar reprogramación de ticket
export const acceptRescheduling = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    if (!ticket.reprogramacion_pendiente) {
      res.status(400).json({ error: 'No hay reprogramación pendiente para este ticket' });
      return;
    }

    const oldFlightId = ticket.flightId;
    const newFlightId = ticket.reprogramacion_pendiente.nuevo_flightId;

    // Decrementar vuelo anterior
    if (oldFlightId) {
      const { Flight } = await import('../models');
      await Flight.findByIdAndUpdate(oldFlightId, {
        $inc: { asientos_ocupados: -1 }
      });
    }

    // Incrementar vuelo nuevo
    const { Flight } = await import('../models');
    await Flight.findByIdAndUpdate(newFlightId, {
      $inc: { asientos_ocupados: 1 }
    });

    // Actualizar ticket
    ticket.flightId = newFlightId;
    ticket.reprogramacion_pendiente = undefined;
    await ticket.save();

    res.json({ message: 'Reprogramación aceptada exitosamente', ticket });
  } catch (error: any) {
    logger.error('Error en acceptRescheduling:', error);
    res.status(500).json({ error: 'Error al aceptar reprogramación' });
  }
};

// Rechazar reprogramación de ticket
export const rejectRescheduling = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    if (!ticket.reprogramacion_pendiente) {
      res.status(400).json({ error: 'No hay reprogramación pendiente para este ticket' });
      return;
    }

    // Simplemente remover la reprogramación pendiente
    ticket.reprogramacion_pendiente = undefined;
    await ticket.save();

    res.json({ message: 'Reprogramación rechazada. Mantiene vuelo original', ticket });
  } catch (error: any) {
    logger.error('Error en rejectRescheduling:', error);
    res.status(500).json({ error: 'Error al rechazar reprogramación' });
  }
};

// Reprogramar todos los tickets del usuario a una tanda específica
export const rescheduleAllUserTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { numero_tanda } = req.body;

    if (!numero_tanda) {
      res.status(400).json({ error: 'Número de tanda es obligatorio' });
      return;
    }

    // Obtener todos los tickets del usuario que estén inscritos
    const tickets = await Ticket.find({
      userId,
      estado: { $in: ['asignado', 'inscrito'] },
      flightId: { $exists: true },
    });

    if (tickets.length === 0) {
      res.status(404).json({ error: 'No tienes tickets inscritos para reprogramar' });
      return;
    }

    // Buscar vuelos disponibles en la tanda objetivo
    const { Flight } = await import('../models');
    const targetFlights = await Flight.find({
      numero_tanda,
      estado: 'abierto',
    });

    if (targetFlights.length === 0) {
      res.status(404).json({ error: `No hay vuelos disponibles en la tanda ${numero_tanda}` });
      return;
    }

    const ticketsReprogramados = [];
    const errores = [];

    for (const ticket of tickets) {
      // Buscar vuelo con espacio en la tanda objetivo
      const vueloConEspacio = targetFlights.find(
        f => (f.capacidad_total - f.asientos_ocupados) > 0
      );

      if (!vueloConEspacio) {
        errores.push({
          ticketId: ticket._id,
          error: 'No hay vuelos con espacio disponible en la tanda objetivo',
        });
        continue;
      }

      const oldFlightId = ticket.flightId;

      // Decrementar vuelo anterior
      if (oldFlightId) {
        await Flight.findByIdAndUpdate(oldFlightId, {
          $inc: { asientos_ocupados: -1 }
        });
      }

      // Incrementar vuelo nuevo
      await Flight.findByIdAndUpdate(vueloConEspacio._id, {
        $inc: { asientos_ocupados: 1 }
      });

      // Actualizar ticket
      ticket.flightId = vueloConEspacio._id;
      ticket.reprogramacion_pendiente = undefined;
      await ticket.save();

      ticketsReprogramados.push({
        ticketId: ticket._id,
        pasajero: ticket.pasajeros[0]?.nombre,
        nuevo_vuelo: vueloConEspacio._id,
      });
    }

    res.json({
      message: 'Reprogramación completada',
      tickets_reprogramados: ticketsReprogramados.length,
      tickets: ticketsReprogramados,
      errores,
    });
  } catch (error: any) {
    logger.error('Error en rescheduleAllUserTickets:', error);
    res.status(500).json({ error: 'Error al reprogramar tickets' });
  }
};
