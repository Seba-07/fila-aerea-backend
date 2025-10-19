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

    // Obtener todos los tickets del usuario (excepto cancelados)
    const tickets = await Ticket.find({
      userId: user._id,
      estado: { $in: ['disponible', 'inscrito', 'volado'] },
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

      // Si se asigna un vuelo, cambiar estado a inscrito e incrementar asientos
      if (flightId) {
        ticket.estado = 'inscrito';

        // Incrementar asientos ocupados del nuevo vuelo (solo si es un cambio nuevo)
        if (!oldFlightId || oldFlightId.toString() !== flightId) {
          const { Flight } = await import('../models');
          await Flight.findByIdAndUpdate(flightId, {
            $inc: { asientos_ocupados: 1 }
          });
        }
      } else {
        // Si se elimina el vuelo, volver a disponible
        ticket.estado = 'disponible';
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

// Rechazar reprogramación de ticket con devolución
export const rejectRescheduling = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const { monto_devolucion, metodo_pago } = req.body;

    const ticket = await Ticket.findById(ticketId).populate('userId');
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    if (!ticket.reprogramacion_pendiente) {
      res.status(400).json({ error: 'No hay reprogramación pendiente para este ticket' });
      return;
    }

    if (!monto_devolucion || monto_devolucion <= 0) {
      res.status(400).json({ error: 'Monto de devolución es obligatorio' });
      return;
    }

    const oldFlightId = ticket.flightId;

    // Decrementar asientos del vuelo original
    if (oldFlightId) {
      const { Flight } = await import('../models');
      await Flight.findByIdAndUpdate(oldFlightId, {
        $inc: { asientos_ocupados: -1 }
      });
    }

    // Registrar devolución en pagos
    const { Payment } = await import('../models');
    await Payment.create({
      userId: ticket.userId,
      monto: -monto_devolucion,
      metodo_pago: metodo_pago || 'efectivo',
      cantidad_tickets: 1,
      tipo: 'devolucion',
      descripcion: `Devolución por rechazo de reprogramación - Circuito ${ticket.reprogramacion_pendiente.numero_circuito_anterior}`,
    });

    // Cancelar ticket
    ticket.flightId = undefined;
    ticket.estado = 'cancelado';
    ticket.reprogramacion_pendiente = undefined;
    await ticket.save();

    res.json({
      message: 'Reprogramación rechazada. Devolución registrada y ticket cancelado',
      monto_devuelto: monto_devolucion,
      ticket,
    });
  } catch (error: any) {
    logger.error('Error en rejectRescheduling:', error);
    res.status(500).json({ error: 'Error al rechazar reprogramación' });
  }
};

// Reprogramar ticket a tanda elegida por el usuario
export const rescheduleToChosenCircuito = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const { numero_circuito } = req.body;

    if (!numero_circuito) {
      res.status(400).json({ error: 'Número de tanda es obligatorio' });
      return;
    }

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    // Buscar vuelos disponibles en el circuito objetivo
    const { Flight } = await import('../models');
    const targetFlights = await Flight.find({
      numero_circuito,
      estado: 'abierto',
    });

    if (targetFlights.length === 0) {
      res.status(404).json({ error: `No hay vuelos disponibles en el circuito ${numero_circuito}` });
      return;
    }

    // Buscar vuelo con espacio
    const vueloConEspacio = targetFlights.find(
      f => (f.capacidad_total - f.asientos_ocupados) > 0
    );

    if (!vueloConEspacio) {
      res.status(400).json({
        error: 'No hay vuelos con espacio disponible en el circuito seleccionada',
      });
      return;
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
    ticket.flightId = vueloConEspacio._id as any;
    ticket.reprogramacion_pendiente = undefined;
    await ticket.save();

    res.json({
      message: 'Ticket reprogramado exitosamente',
      tanda_nueva: numero_circuito,
      vuelo: vueloConEspacio._id,
      ticket,
    });
  } catch (error: any) {
    logger.error('Error en rescheduleToChosenCircuito:', error);
    res.status(500).json({ error: 'Error al reprogramar ticket' });
  }
};

// Inscribir ticket en un vuelo
export const inscribeTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const { flightId } = req.body;
    const userId = req.user?.userId;

    if (!flightId) {
      res.status(400).json({ error: 'ID de vuelo es obligatorio' });
      return;
    }

    // Verificar que el ticket existe y pertenece al usuario
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    if (ticket.userId.toString() !== userId) {
      res.status(403).json({ error: 'No tienes permiso para inscribir este ticket' });
      return;
    }

    // Verificar que el ticket está disponible
    if (ticket.estado !== 'disponible') {
      res.status(400).json({ error: `El ticket no está disponible (estado: ${ticket.estado})` });
      return;
    }

    // Verificar que el ticket tiene pasajero asignado
    if (!ticket.pasajeros || ticket.pasajeros.length === 0 || !ticket.pasajeros[0].nombre) {
      res.status(400).json({ error: 'El ticket debe tener un pasajero asignado' });
      return;
    }

    // Verificar que el vuelo existe y está abierto
    const { Flight } = await import('../models');
    const flight = await Flight.findById(flightId);

    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    if (flight.estado !== 'abierto') {
      res.status(400).json({ error: `El vuelo no está disponible (estado: ${flight.estado})` });
      return;
    }

    // Verificar si el pasajero es infante (< 2 años) - no ocupa asiento
    const esInfante = ticket.pasajeros[0]?.esInfante === true;

    // Verificar que hay asientos disponibles (solo si no es infante)
    if (!esInfante) {
      const asientosDisponibles = flight.capacidad_total - flight.asientos_ocupados;
      if (asientosDisponibles <= 0) {
        res.status(400).json({ error: 'No hay asientos disponibles en este vuelo' });
        return;
      }
    }

    // Inscribir el ticket
    ticket.flightId = flightId as any;
    ticket.estado = 'inscrito';
    await ticket.save();

    // Incrementar asientos ocupados solo si no es infante
    if (!esInfante) {
      flight.asientos_ocupados += 1;
      await flight.save();
    }

    // Registrar en event log
    const { EventLog } = await import('../models');
    await EventLog.create({
      type: 'ticket_inscribed',
      entity: 'ticket',
      entityId: ticket._id.toString(),
      userId,
      payload: {
        flightId: flight._id.toString(),
        numero_circuito: flight.numero_circuito,
        pasajero: ticket.pasajeros[0],
      },
    });

    logger.info(`Ticket ${ticket.codigo_ticket} inscrito en vuelo ${flight._id}`);

    // Enviar email con pase de embarque
    try {
      const { User } = await import('../models');
      const user = await User.findById(userId);
      if (user && user.email) {
        const { emailService } = await import('../services/emailService');

        // Poblar aircraftId si no está poblado
        if (!flight.aircraftId || typeof flight.aircraftId === 'string') {
          await flight.populate('aircraftId');
        }

        await emailService.sendBoardingPass({
          to: user.email,
          ticket: ticket.toObject(),
          flight: flight.toObject(),
          pasajero: ticket.pasajeros[0],
        });
        logger.info(`📧 Pase de embarque enviado a ${user.email}`);
      }
    } catch (emailError) {
      // No fallar la inscripción si el email falla
      logger.error('Error al enviar email de pase de embarque:', emailError);
    }

    res.json({
      message: 'Ticket inscrito exitosamente',
      ticket,
    });
  } catch (error: any) {
    logger.error('Error en inscribeTicket:', error);
    res.status(500).json({ error: 'Error al inscribir ticket' });
  }
};

// Aceptar cambio de hora
export const acceptTimeChange = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    if (!ticket.cambio_hora_pendiente) {
      res.status(400).json({ error: 'No hay cambio de hora pendiente para este ticket' });
      return;
    }

    // Simplemente eliminar el cambio pendiente ya que el vuelo ya tiene la nueva hora
    ticket.cambio_hora_pendiente = undefined;
    await ticket.save();

    res.json({ message: 'Cambio de hora aceptado exitosamente', ticket });
  } catch (error: any) {
    logger.error('Error en acceptTimeChange:', error);
    res.status(500).json({ error: 'Error al aceptar cambio de hora' });
  }
};

// Rechazar cambio de hora - ofrecer devolución o reprogramación
export const rejectTimeChange = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const { accion, monto_devolucion, metodo_pago, numero_circuito_nueva } = req.body;

    const ticket = await Ticket.findById(ticketId).populate('userId flightId');
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    if (!ticket.cambio_hora_pendiente) {
      res.status(400).json({ error: 'No hay cambio de hora pendiente para este ticket' });
      return;
    }

    const oldFlightId = ticket.flightId;

    // Acción: devolucion
    if (accion === 'devolucion') {
      if (!monto_devolucion || monto_devolucion <= 0) {
        res.status(400).json({ error: 'Monto de devolución es obligatorio' });
        return;
      }

      // Decrementar asientos del vuelo
      if (oldFlightId) {
        const { Flight } = await import('../models');
        await Flight.findByIdAndUpdate(oldFlightId, {
          $inc: { asientos_ocupados: -1 }
        });
      }

      // Registrar devolución
      const { Payment } = await import('../models');
      const flight: any = ticket.flightId;
      await Payment.create({
        userId: ticket.userId,
        monto: -monto_devolucion,
        metodo_pago: metodo_pago || 'efectivo',
        cantidad_tickets: 1,
        tipo: 'devolucion',
        descripcion: `Devolución por rechazo de cambio de hora - Circuito ${flight?.numero_circuito}`,
      });

      // Cancelar ticket
      ticket.flightId = undefined;
      ticket.estado = 'cancelado';
      ticket.cambio_hora_pendiente = undefined;
      await ticket.save();

      res.json({
        message: 'Cambio de hora rechazado. Devolución registrada y ticket cancelado',
        monto_devuelto: monto_devolucion,
        ticket,
      });
      return;
    }

    // Acción: reprogramar
    if (accion === 'reprogramar') {
      if (!numero_circuito_nueva) {
        res.status(400).json({ error: 'Número de tanda nueva es obligatorio para reprogramar' });
        return;
      }

      const { Flight } = await import('../models');

      // Buscar vuelos disponibles en la nueva tanda
      const vueloNuevo = await Flight.findOne({
        numero_circuito: numero_circuito_nueva,
        estado: 'abierto',
        $expr: { $lt: ['$asientos_ocupados', '$capacidad_total'] }
      });

      if (!vueloNuevo) {
        res.status(404).json({ error: 'No hay vuelos disponibles en el circuito seleccionada' });
        return;
      }

      // Decrementar vuelo anterior
      if (oldFlightId) {
        await Flight.findByIdAndUpdate(oldFlightId, {
          $inc: { asientos_ocupados: -1 }
        });
      }

      // Incrementar vuelo nuevo
      await Flight.findByIdAndUpdate(vueloNuevo._id, {
        $inc: { asientos_ocupados: 1 }
      });

      // Actualizar ticket
      ticket.flightId = vueloNuevo._id as any;
      ticket.cambio_hora_pendiente = undefined;
      await ticket.save();

      res.json({
        message: 'Ticket reprogramado exitosamente a nueva tanda',
        tanda_nueva: numero_circuito_nueva,
        ticket,
      });
      return;
    }

    res.status(400).json({ error: 'Acción no válida. Debe ser "devolucion" o "reprogramar"' });
  } catch (error: any) {
    logger.error('Error en rejectTimeChange:', error);
    res.status(500).json({ error: 'Error al rechazar cambio de hora' });
  }
};

// Subir autorización para menor
export const uploadAutorizacion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const userId = req.user?.userId;

    if (!req.file) {
      res.status(400).json({ error: 'No se ha subido ningún archivo' });
      return;
    }

    // Verificar que el ticket existe y pertenece al usuario
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    if (ticket.userId.toString() !== userId) {
      res.status(403).json({ error: 'No tienes permiso para modificar este ticket' });
      return;
    }

    // Verificar que el pasajero es menor
    if (!ticket.pasajeros || ticket.pasajeros.length === 0 || !ticket.pasajeros[0].esMenor) {
      res.status(400).json({ error: 'Este ticket no corresponde a un menor' });
      return;
    }

    // Guardar la URL del archivo (en producción usarías S3, Cloudinary, etc.)
    // Por ahora guardamos la ruta del archivo
    const fileUrl = `/uploads/autorizaciones/${req.file.filename}`;
    ticket.pasajeros[0].autorizacion_url = fileUrl;
    await ticket.save();

    res.json({
      message: 'Autorización subida exitosamente',
      url: fileUrl,
      ticket
    });
  } catch (error: any) {
    logger.error('Error en uploadAutorizacion:', error);
    res.status(500).json({ error: 'Error al subir autorización' });
  }
};
