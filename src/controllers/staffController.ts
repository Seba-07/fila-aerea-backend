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
    const { nombre, apellido, rut, email, cantidad_tickets, metodo_pago, monto, pasajeros, flightId } = req.body;

    if (!nombre || !apellido || !email || !cantidad_tickets || !metodo_pago || monto === undefined) {
      res.status(400).json({
        error: 'Nombre, apellido, email, cantidad de tickets, método de pago y monto son obligatorios',
      });
      return;
    }

    if (cantidad_tickets < 1 || cantidad_tickets > 10) {
      res.status(400).json({
        error: 'La cantidad de tickets debe estar entre 1 y 10',
      });
      return;
    }

    if (!['transferencia', 'passline', 'efectivo'].includes(metodo_pago)) {
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

    // Validar que si hay menores, haya al menos un adulto
    if (pasajeros && Array.isArray(pasajeros)) {
      const pasajerosConDatos = pasajeros.filter(p => p.nombre || p.apellido || p.rut);
      const menores = pasajerosConDatos.filter(p => p.esMenor === true);
      const adultos = pasajerosConDatos.filter(p => !p.esMenor);

      if (menores.length > 0 && adultos.length === 0) {
        res.status(400).json({
          error: 'Si hay menores de edad en la reserva, debe haber al menos un adulto',
        });
        return;
      }
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
      apellido,
      rut: rut || undefined,
      email: email.toLowerCase(),
      verificado: true,
      rol: 'passenger',
    });

    // Crear tickets con datos de pasajeros si se proporcionan
    const tickets = [];
    const baseTimestamp = Date.now();
    for (let i = 1; i <= cantidad_tickets; i++) {
      // Generar código único combinando timestamp + índice + random
      const random = Math.random().toString(36).substr(2, 4).toUpperCase();
      const codigo_ticket = `TKT-${baseTimestamp}-${i}-${random}`;
      const pasajeroData = pasajeros && pasajeros[i - 1];

      const pasajeroInfo = pasajeroData && (pasajeroData.nombre || pasajeroData.apellido || pasajeroData.rut)
        ? [{
            nombre: pasajeroData.nombre || '',
            apellido: pasajeroData.apellido || '',
            rut: pasajeroData.rut || '',
            esMenor: pasajeroData.esMenor || false,
          }]
        : [];

      tickets.push({
        userId: user._id,
        codigo_ticket,
        pasajeros: pasajeroInfo,
        estado: pasajeroInfo.length > 0 && flightId ? 'asignado' : 'disponible',
        flightId: pasajeroInfo.length > 0 && flightId ? flightId : undefined,
      });
    }

    const createdTickets = await Ticket.insertMany(tickets);

    // Registrar pago
    await Payment.create({
      userId: user._id,
      monto,
      metodo_pago,
      cantidad_tickets,
      tipo: 'compra',
      descripcion: `Compra inicial de ${cantidad_tickets} ticket(s)`,
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

    // Actualizar estados de tickets en vuelos finalizados
    const { Flight } = await import('../models');
    const vuelosFinalizados = await Flight.find({ estado: 'finalizado' }).select('_id');
    const idsVuelosFinalizados = vuelosFinalizados.map(v => v._id);

    const updateResult = await Ticket.updateMany(
      {
        flightId: { $in: idsVuelosFinalizados },
        estado: { $in: ['asignado', 'inscrito', 'embarcado'] }
      },
      { $set: { estado: 'volado' } }
    );

    if (updateResult.modifiedCount > 0) {
      logger.info(`✅ ${updateResult.modifiedCount} tickets actualizados a 'volado' por vuelos finalizados`);
    }

    const passengersWithTickets = await Promise.all(
      passengers.map(async (p) => {
        const tickets = await Ticket.find({
          userId: p._id,
        }).populate('flightId', 'numero_circuito');

        // Obtener pagos del pasajero
        const payments = await Payment.find({
          userId: p._id,
        }).sort({ fecha: 1 });

        // Calcular monto total pagado
        const totalPagado = payments.reduce((sum, payment) => {
          if (payment.tipo === 'compra' || payment.tipo === 'ajuste_positivo') {
            return sum + payment.monto;
          } else if (payment.tipo === 'ajuste_negativo' || payment.tipo === 'devolucion') {
            return sum - payment.monto;
          }
          return sum;
        }, 0);

        // Obtener el primer pago (compra inicial)
        const pagoInicial = payments.find(p => p.tipo === 'compra');

        return {
          id: p._id,
          nombre: p.nombre,
          email: p.email,
          tickets_count: tickets.length,
          total_pagado: totalPagado,
          pago_inicial: pagoInicial ? {
            id: pagoInicial._id,
            monto: pagoInicial.monto,
            metodo_pago: pagoInicial.metodo_pago,
            fecha: pagoInicial.fecha,
          } : null,
          tickets: tickets.map(t => ({
            id: t._id,
            codigo_ticket: t.codigo_ticket,
            estado: t.estado,
            pasajeros: t.pasajeros,
            flightId: t.flightId ? (t.flightId as any)._id : null,
            flightNumber: t.flightId ? (t.flightId as any).numero_circuito : null,
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

// Obtener pasajeros con tickets sin inscribir
export const getPassengersWithoutFlight = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Buscar tickets que tengan pasajeros pero no estén inscritos en un vuelo
    const ticketsSinVuelo = await Ticket.find({
      pasajeros: { $exists: true, $not: { $size: 0 } },
      $or: [
        { flightId: { $exists: false } },
        { flightId: null },
      ],
      estado: { $in: ['disponible', 'asignado'] }
    }).populate('userId');

    // Agrupar por usuario
    const pasajerosPorUsuario: any = {};

    for (const ticket of ticketsSinVuelo) {
      const userId = String((ticket.userId as any)._id);

      if (!pasajerosPorUsuario[userId]) {
        pasajerosPorUsuario[userId] = {
          userId,
          userName: (ticket.userId as any).nombre,
          userEmail: (ticket.userId as any).email,
          tickets: [],
        };
      }

      pasajerosPorUsuario[userId].tickets.push({
        ticketId: ticket._id,
        pasajeros: ticket.pasajeros,
        estado: ticket.estado,
      });
    }

    res.json(Object.values(pasajerosPorUsuario));
  } catch (error: any) {
    logger.error('Error en getPassengersWithoutFlight:', error);
    res.status(500).json({ error: 'Error al obtener pasajeros sin vuelo' });
  }
};

// Editar información del pasajero
export const updatePassenger = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { passengerId } = req.params;
    const { nombre, email } = req.body;

    const user = await User.findById(passengerId);
    if (!user || user.rol !== 'passenger') {
      res.status(404).json({ error: 'Pasajero no encontrado' });
      return;
    }

    if (nombre) user.nombre = nombre;
    if (email) user.email = email.toLowerCase();

    await user.save();

    res.json({ message: 'Pasajero actualizado exitosamente', user });
  } catch (error: any) {
    logger.error('Error en updatePassenger:', error);
    res.status(500).json({ error: 'Error al actualizar pasajero' });
  }
};

// Editar cantidad de tickets de un pasajero (con ajuste de pago)
export const updatePassengerTickets = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { passengerId } = req.params;
    const { cantidad_tickets, monto_ajuste, metodo_pago } = req.body;

    if (cantidad_tickets === undefined || cantidad_tickets < 0 || cantidad_tickets > 20) {
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
    const diferencia = cantidad_tickets - currentCount;

    if (diferencia > 0) {
      // Agregar tickets
      const newTickets = [];
      const baseTimestamp = Date.now();
      for (let i = 1; i <= diferencia; i++) {
        const random = Math.random().toString(36).substr(2, 4).toUpperCase();
        const codigo_ticket = `TKT-${baseTimestamp}-${i}-${random}`;
        newTickets.push({
          userId: passengerId,
          codigo_ticket,
          pasajeros: [],
          estado: 'disponible',
        });
      }
      await Ticket.insertMany(newTickets);

      // Registrar ajuste positivo si hay monto
      if (monto_ajuste && monto_ajuste > 0) {
        await Payment.create({
          userId: passengerId,
          monto: monto_ajuste,
          metodo_pago: metodo_pago || 'efectivo',
          cantidad_tickets: diferencia,
          tipo: 'ajuste_positivo',
          descripcion: `Agregados ${diferencia} tickets`,
        });
      }
    } else if (diferencia < 0) {
      // Eliminar tickets disponibles
      const ticketsToRemove = Math.abs(diferencia);
      const availableTickets = currentTickets.filter(t => t.estado === 'disponible');

      if (availableTickets.length < ticketsToRemove) {
        res.status(400).json({
          error: `No hay suficientes tickets disponibles para eliminar. Solo ${availableTickets.length} tickets están disponibles.`,
        });
        return;
      }

      const ticketIdsToRemove = availableTickets.slice(0, ticketsToRemove).map(t => t._id);
      await Ticket.deleteMany({ _id: { $in: ticketIdsToRemove } });

      // Registrar devolución si hay monto
      if (monto_ajuste && monto_ajuste > 0) {
        await Payment.create({
          userId: passengerId,
          monto: -monto_ajuste,
          metodo_pago: metodo_pago || 'efectivo',
          cantidad_tickets: ticketsToRemove,
          tipo: 'ajuste_negativo',
          descripcion: `Eliminados ${ticketsToRemove} tickets - Devolución`,
        });
      }
    }

    res.json({ message: 'Tickets actualizados exitosamente' });
  } catch (error: any) {
    logger.error('Error en updatePassengerTickets:', error);
    res.status(500).json({ error: 'Error al actualizar tickets' });
  }
};

// Actualizar información de pasajeros en un ticket
export const updateTicketPassengers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const { pasajeros } = req.body;

    if (!pasajeros || !Array.isArray(pasajeros)) {
      res.status(400).json({ error: 'Se requiere un array de pasajeros' });
      return;
    }

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    // Validar que si hay menores, haya al menos un adulto en el ticket
    const menores = pasajeros.filter(p => p.esMenor === true);
    const adultos = pasajeros.filter(p => !p.esMenor);

    if (menores.length > 0 && adultos.length === 0) {
      res.status(400).json({
        error: 'Si hay menores de edad en el ticket, debe haber al menos un adulto',
      });
      return;
    }

    ticket.pasajeros = pasajeros.map(p => ({
      nombre: p.nombre || '',
      apellido: p.apellido || '',
      rut: p.rut || '',
      esMenor: p.esMenor || false,
    }));

    // Si el ticket tenía pasajeros y ahora no tiene, cambiar estado a disponible
    if (pasajeros.length === 0 && ticket.estado === 'asignado') {
      ticket.estado = 'disponible';
    }
    // Si el ticket no tenía pasajeros y ahora tiene, cambiar a asignado
    else if (pasajeros.length > 0 && ticket.estado === 'disponible') {
      ticket.estado = 'asignado';
    }

    await ticket.save();

    await EventLog.create({
      type: 'ticket_passengers_updated',
      entity: 'ticket',
      entityId: String(ticket._id),
      userId: req.user?.userId,
      payload: {
        ticketId: ticket._id,
        pasajeros: ticket.pasajeros,
      },
    });

    logger.info(`Información de pasajeros actualizada para ticket ${ticket._id}`);

    res.json({ message: 'Información de pasajeros actualizada exitosamente', ticket });
  } catch (error: any) {
    logger.error('Error en updateTicketPassengers:', error);
    res.status(500).json({ error: 'Error al actualizar información de pasajeros' });
  }
};

// Eliminar pasajero (con devolución completa)
export const deletePassenger = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { passengerId } = req.params;
    const { monto_devolucion, metodo_pago } = req.body;

    const user = await User.findById(passengerId);
    if (!user || user.rol !== 'passenger') {
      res.status(404).json({ error: 'Pasajero no encontrado' });
      return;
    }

    const tickets = await Ticket.find({ userId: passengerId });
    const ticketsNoDisponibles = tickets.filter(t => t.estado !== 'disponible');

    if (ticketsNoDisponibles.length > 0) {
      res.status(400).json({
        error: `No se puede eliminar el pasajero. Tiene ${ticketsNoDisponibles.length} tickets en uso.`,
      });
      return;
    }

    // Registrar devolución completa
    if (monto_devolucion && monto_devolucion > 0) {
      await Payment.create({
        userId: passengerId,
        monto: -monto_devolucion,
        metodo_pago: metodo_pago || 'efectivo',
        cantidad_tickets: tickets.length,
        tipo: 'devolucion',
        descripcion: `Devolución completa - Pasajero eliminado`,
      });
    }

    // Eliminar tickets y usuario
    await Ticket.deleteMany({ userId: passengerId });
    await User.findByIdAndDelete(passengerId);

    res.json({ message: 'Pasajero eliminado exitosamente' });
  } catch (error: any) {
    logger.error('Error en deletePassenger:', error);
    res.status(500).json({ error: 'Error al eliminar pasajero' });
  }
};

// Obtener historial de pagos con dinero confirmado
export const getPayments = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const payments = await Payment.find()
      .populate('userId', 'nombre apellido email')
      .sort({ createdAt: -1 });

    const paymentsFormatted = payments.map(p => {
      const user = p.userId as any;

      // Manejar caso de usuario eliminado
      if (!user) {
        return {
          id: p._id,
          usuario: {
            id: null,
            nombre: 'Usuario Eliminado',
            email: 'N/A',
          },
          monto: p.monto,
          metodo_pago: p.metodo_pago,
          cantidad_tickets: p.cantidad_tickets,
          tipo: p.tipo,
          descripcion: p.descripcion,
          fecha: p.fecha,
        };
      }

      const nombreCompleto = user.apellido
        ? `${user.nombre} ${user.apellido}`
        : user.nombre;

      return {
        id: p._id,
        usuario: {
          id: user._id,
          nombre: nombreCompleto,
          email: user.email,
        },
        monto: p.monto,
        metodo_pago: p.metodo_pago,
        cantidad_tickets: p.cantidad_tickets,
        tipo: p.tipo,
        descripcion: p.descripcion,
        fecha: p.fecha,
      };
    });

    // Total recaudado (solo pagos tipo 'compra' y 'ajuste_positivo')
    const totalRecaudado = payments
      .filter(p => p.tipo === 'compra' || p.tipo === 'ajuste_positivo')
      .reduce((sum, p) => sum + p.monto, 0);

    // Dinero confirmado: solo de tickets que han volado (estado 'volado')
    const allTickets = await Ticket.find({ estado: 'volado' }).populate('userId');
    const confirmedUserIds = [...new Set(allTickets.map(t => String(t.userId._id)))];

    let totalConfirmado = 0;
    for (const userId of confirmedUserIds) {
      const userPayments = await Payment.find({
        userId,
        tipo: { $in: ['compra', 'ajuste_positivo'] }
      });
      const userTotal = userPayments.reduce((sum, p) => sum + p.monto, 0);

      // Solo contar si el usuario tiene al menos 1 ticket volado
      const ticketsVolados = allTickets.filter(t => String(t.userId._id) === userId);
      if (ticketsVolados.length > 0) {
        totalConfirmado += userTotal;
      }
    }

    // Pendiente devolución: solo pagos tipo 'devolucion' y 'ajuste_negativo' (valores negativos)
    const totalDevoluciones = payments
      .filter(p => p.tipo === 'devolucion' || p.tipo === 'ajuste_negativo')
      .reduce((sum, p) => sum + Math.abs(p.monto), 0);

    res.json({
      payments: paymentsFormatted,
      total_recaudado: totalRecaudado,
      total_confirmado: totalConfirmado,
      pendiente_devolucion: totalDevoluciones,
    });
  } catch (error: any) {
    logger.error('Error en getPayments:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
};

// Crear nueva tanda o agregar aviones a tanda existente
export const createCircuito = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { numero_circuito, fecha_hora, hora_prevista, aircraftIds } = req.body;

    if (!numero_circuito || !fecha_hora || !aircraftIds || !Array.isArray(aircraftIds)) {
      res.status(400).json({
        error: 'Número de tanda, fecha/hora y lista de aviones son obligatorios',
      });
      return;
    }

    const { Flight, Aircraft, Settings } = await import('../models');

    // Verificar si el circuito existe
    const existingCircuito = await Flight.findOne({ numero_circuito });

    // Calcular hora prevista de salida
    let hora_prevista_salida;
    if (hora_prevista) {
      // Si se proporciona hora prevista (tanda #1), guardarla como UTC
      const fechaBase = new Date(fecha_hora);
      const [horas, minutos] = hora_prevista.split(':');

      hora_prevista_salida = new Date(Date.UTC(
        fechaBase.getUTCFullYear(),
        fechaBase.getUTCMonth(),
        fechaBase.getUTCDate(),
        parseInt(horas),
        parseInt(minutos),
        0,
        0
      ));
    } else if (numero_circuito > 1) {
      // Si no se proporciona hora (tanda > 1), calcular basándose en el circuito anterior
      const settings = await Settings.findOne();
      if (settings && settings.duracion_circuito_minutos) {
        // Buscar el circuito inmediatamente anterior
        const circuitoAnterior = await Flight.findOne({
          numero_circuito: numero_circuito - 1
        }).sort({ numero_circuito: -1 });

        if (circuitoAnterior && circuitoAnterior.hora_prevista_salida) {
          // Calcular hora sumando la duración de el circuito
          const duracionMs = settings.duracion_circuito_minutos * 60 * 1000;
          hora_prevista_salida = new Date(circuitoAnterior.hora_prevista_salida.getTime() + duracionMs);
        }
      }
    }

    const flights = [];

    for (const aircraftId of aircraftIds) {
      // Verificar que el avión no esté ya en el circuito con estado activo
      // (ignorar vuelos reprogramados o cancelados)
      const existingFlight = await Flight.findOne({
        numero_circuito,
        aircraftId,
        estado: { $in: ['abierto', 'en_vuelo', 'finalizado'] }
      });
      if (existingFlight) {
        continue; // Saltar aviones que ya están en el circuito activamente
      }

      const aircraft = await Aircraft.findById(aircraftId);
      if (!aircraft) {
        res.status(404).json({ error: `Avión ${aircraftId} no encontrado` });
        return;
      }

      flights.push({
        aircraftId,
        numero_circuito,
        fecha_hora: new Date(fecha_hora),
        hora_prevista_salida,
        capacidad_total: aircraft.capacidad,
        asientos_ocupados: 0,
        estado: 'abierto',
      });
    }

    if (flights.length === 0) {
      res.status(400).json({ error: 'Todos los aviones ya están en esta tanda' });
      return;
    }

    const createdFlights = await Flight.insertMany(flights);

    // Si es una nueva tanda y tiene hora prevista, recalcular tandas siguientes
    if (!existingCircuito && hora_prevista_salida) {
      const settings = await Settings.findOne();
      if (settings && settings.duracion_circuito_minutos) {
        const duracionCircuito = settings.duracion_circuito_minutos;

        // Obtener tandas siguientes
        const circuitosSiguientes = await Flight.find({
          numero_circuito: { $gt: numero_circuito },
          estado: { $in: ['abierto', 'en_vuelo'] },
        }).sort({ numero_circuito: 1 });

        if (circuitosSiguientes.length > 0) {
          let circuitoAnterior = numero_circuito;
          let horaBase = new Date(hora_prevista_salida);

          for (const vuelo of circuitosSiguientes) {
            if (vuelo.numero_circuito !== circuitoAnterior) {
              const diferenciaCircuitos = vuelo.numero_circuito - circuitoAnterior;
              horaBase = new Date(hora_prevista_salida.getTime() + (duracionCircuito * diferenciaCircuitos * 60 * 1000));
              circuitoAnterior = vuelo.numero_circuito;
            }

            vuelo.hora_prevista_salida = new Date(horaBase);
            await vuelo.save();
          }

          logger.info(`Recalculadas ${circuitosSiguientes.length} horas de tandas siguientes a tanda ${numero_circuito}`);
        }
      }
    }

    await EventLog.create({
      type: existingCircuito ? 'circuito_aircraft_added' : 'circuito_created',
      entity: 'flight',
      entityId: String(numero_circuito),
      userId: req.user?.userId,
      payload: { numero_circuito, fecha_hora, hora_prevista, aircraftIds },
    });

    res.json({
      message: existingCircuito ? 'Aviones agregados a el circuito exitosamente' : 'Circuito creado exitosamente',
      flights: createdFlights,
    });
  } catch (error: any) {
    logger.error('Error en createCircuito:', error);
    res.status(500).json({ error: 'Error al crear tanda' });
  }
};

// Eliminar tanda completa
export const deleteCircuito = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { numero_circuito } = req.params;

    const { Flight } = await import('../models');
    const flights = await Flight.find({ numero_circuito: Number(numero_circuito) });

    if (flights.length === 0) {
      res.status(404).json({ error: 'Circuito no encontrado' });
      return;
    }

    // Verificar que ningún vuelo tenga pasajeros inscritos
    const flightsWithPassengers = flights.filter(f => f.asientos_ocupados > 0);
    if (flightsWithPassengers.length > 0) {
      res.status(400).json({
        error: `No se puede eliminar el circuito. ${flightsWithPassengers.length} vuelo(s) tienen pasajeros inscritos.`,
      });
      return;
    }

    // Eliminar todos los vuelos de el circuito
    await Flight.deleteMany({ numero_circuito: Number(numero_circuito) });

    await EventLog.create({
      type: 'circuito_deleted',
      entity: 'flight',
      entityId: numero_circuito,
      userId: req.user?.userId,
      payload: { numero_circuito },
    });

    res.json({ message: 'Circuito eliminado exitosamente' });
  } catch (error: any) {
    logger.error('Error en deleteCircuito:', error);
    res.status(500).json({ error: 'Error al eliminar tanda' });
  }
};

// Validar código QR de pase de embarque
export const validateQR = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { ticketId, codigo, flightId, circuito } = req.body;

    if (!ticketId || !codigo || !flightId) {
      res.status(400).json({
        valido: false,
        mensaje: 'Datos del QR incompletos'
      });
      return;
    }

    // Verificar que el ticket existe y está inscrito
    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      res.status(404).json({
        valido: false,
        mensaje: 'Ticket no encontrado'
      });
      return;
    }

    if (ticket.codigo_ticket !== codigo) {
      res.status(400).json({
        valido: false,
        mensaje: 'Código de ticket no coincide'
      });
      return;
    }

    if (ticket.estado !== 'inscrito') {
      res.status(400).json({
        valido: false,
        mensaje: `Ticket no está inscrito (estado: ${ticket.estado})`
      });
      return;
    }

    if (String(ticket.flightId) !== flightId) {
      res.status(400).json({
        valido: false,
        mensaje: 'Este ticket no pertenece a este vuelo'
      });
      return;
    }

    // Verificar que el vuelo existe y está en estado correcto
    const { Flight } = await import('../models');
    const flight = await Flight.findById(flightId);

    if (!flight) {
      res.status(404).json({
        valido: false,
        mensaje: 'Vuelo no encontrado'
      });
      return;
    }

    // Verificar que el circuito del QR coincide con el circuito del vuelo
    if (circuito && flight.numero_circuito !== circuito) {
      res.status(400).json({
        valido: false,
        mensaje: `Este pasajero pertenece al circuito ${flight.numero_circuito}, no al circuito ${circuito}`
      });
      return;
    }

    if (flight.estado !== 'abierto' && flight.estado !== 'en_vuelo') {
      res.status(400).json({
        valido: false,
        mensaje: `Vuelo no disponible para embarque (estado: ${flight.estado})`
      });
      return;
    }

    // Cambiar estado del ticket a "embarcado"
    ticket.estado = 'embarcado';
    await ticket.save();

    // Registrar evento de validación exitosa
    await EventLog.create({
      type: 'qr_validated',
      entity: 'ticket',
      entityId: String(ticket._id),
      userId: req.user?.userId,
      payload: {
        codigo_ticket: codigo,
        flightId,
        circuito,
        validado_por: req.user?.email
      },
    });

    logger.info(`✅ QR validado: ticket ${codigo} para vuelo ${flightId} - Estado cambiado a embarcado`);

    res.json({
      valido: true,
      mensaje: 'Pasajero verificado correctamente',
      ticket: {
        codigo: ticket.codigo_ticket,
        pasajero: ticket.pasajeros?.[0] || null,
        estado: 'embarcado'
      },
      flight: {
        numero_circuito: flight.numero_circuito,
        estado: flight.estado
      }
    });
  } catch (error: any) {
    logger.error('Error en validateQR:', error);
    res.status(500).json({
      valido: false,
      mensaje: 'Error al validar QR'
    });
  }
};

// Actualizar monto del pago inicial de un pasajero
export const updatePassengerPayment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { passengerId } = req.params;
    const { nuevo_monto, metodo_pago } = req.body;

    if (!nuevo_monto || nuevo_monto < 0) {
      res.status(400).json({ error: 'El monto debe ser mayor o igual a 0' });
      return;
    }

    // Verificar que el pasajero existe
    const user = await User.findById(passengerId);
    if (!user || user.rol !== 'passenger') {
      res.status(404).json({ error: 'Pasajero no encontrado' });
      return;
    }

    // Buscar el pago inicial (tipo 'compra')
    const pagoInicial = await Payment.findOne({
      userId: passengerId,
      tipo: 'compra',
    });

    if (!pagoInicial) {
      res.status(404).json({ error: 'No se encontró el pago inicial del pasajero' });
      return;
    }

    const montoAnterior = pagoInicial.monto;

    // Actualizar el pago
    pagoInicial.monto = nuevo_monto;
    if (metodo_pago) {
      pagoInicial.metodo_pago = metodo_pago;
    }
    await pagoInicial.save();

    await EventLog.create({
      type: 'payment_updated',
      entity: 'payment',
      entityId: String(pagoInicial._id),
      userId: req.user?.userId,
      payload: {
        passengerId,
        monto_anterior: montoAnterior,
        monto_nuevo: nuevo_monto,
        metodo_pago: pagoInicial.metodo_pago,
      },
    });

    logger.info(`Pago inicial actualizado para pasajero ${passengerId}: $${montoAnterior} → $${nuevo_monto}`);

    res.json({
      message: 'Monto del pago actualizado exitosamente',
      pago: {
        id: pagoInicial._id,
        monto_anterior: montoAnterior,
        monto_nuevo: nuevo_monto,
        metodo_pago: pagoInicial.metodo_pago,
      },
    });
  } catch (error: any) {
    logger.error('Error en updatePassengerPayment:', error);
    res.status(500).json({ error: 'Error al actualizar el pago' });
  }
};
