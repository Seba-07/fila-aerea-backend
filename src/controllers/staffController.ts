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
    for (let i = 1; i <= cantidad_tickets; i++) {
      const codigo_ticket = `TIX${Date.now()}${i}`.toUpperCase().slice(0, 12);
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
        { estado: 'disponible' },
      ]
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
      for (let i = 1; i <= diferencia; i++) {
        const codigo_ticket = `TIX${Date.now()}${i}`.toUpperCase().slice(0, 12);
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
export const createTanda = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { numero_tanda, fecha_hora, hora_prevista, aircraftIds } = req.body;

    if (!numero_tanda || !fecha_hora || !aircraftIds || !Array.isArray(aircraftIds)) {
      res.status(400).json({
        error: 'Número de tanda, fecha/hora y lista de aviones son obligatorios',
      });
      return;
    }

    const { Flight, Aircraft, Settings } = await import('../models');

    // Verificar si la tanda existe
    const existingTanda = await Flight.findOne({ numero_tanda });

    // Calcular hora prevista de salida
    let hora_prevista_salida;
    if (hora_prevista) {
      // Si se proporciona hora prevista, usarla
      const fechaBase = new Date(fecha_hora);
      const [horas, minutos] = hora_prevista.split(':');

      hora_prevista_salida = new Date(Date.UTC(
        fechaBase.getFullYear(),
        fechaBase.getMonth(),
        fechaBase.getDate(),
        parseInt(horas),
        parseInt(minutos),
        0,
        0
      ));
    }

    const flights = [];

    for (const aircraftId of aircraftIds) {
      // Verificar que el avión no esté ya en la tanda con estado activo
      // (ignorar vuelos reprogramados o cancelados)
      const existingFlight = await Flight.findOne({
        numero_tanda,
        aircraftId,
        estado: { $in: ['abierto', 'en_vuelo', 'finalizado'] }
      });
      if (existingFlight) {
        continue; // Saltar aviones que ya están en la tanda activamente
      }

      const aircraft = await Aircraft.findById(aircraftId);
      if (!aircraft) {
        res.status(404).json({ error: `Avión ${aircraftId} no encontrado` });
        return;
      }

      flights.push({
        aircraftId,
        numero_tanda,
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
    if (!existingTanda && hora_prevista_salida) {
      const settings = await Settings.findOne();
      if (settings && settings.duracion_tanda_minutos) {
        const duracionTanda = settings.duracion_tanda_minutos;

        // Obtener tandas siguientes
        const tandasSiguientes = await Flight.find({
          numero_tanda: { $gt: numero_tanda },
          estado: { $in: ['abierto', 'en_vuelo'] },
        }).sort({ numero_tanda: 1 });

        if (tandasSiguientes.length > 0) {
          let tandaAnterior = numero_tanda;
          let horaBase = new Date(hora_prevista_salida);

          for (const vuelo of tandasSiguientes) {
            if (vuelo.numero_tanda !== tandaAnterior) {
              const diferenciaTandas = vuelo.numero_tanda - tandaAnterior;
              horaBase = new Date(hora_prevista_salida.getTime() + (duracionTanda * diferenciaTandas * 60 * 1000));
              tandaAnterior = vuelo.numero_tanda;
            }

            vuelo.hora_prevista_salida = new Date(horaBase);
            await vuelo.save();
          }

          logger.info(`Recalculadas ${tandasSiguientes.length} horas de tandas siguientes a tanda ${numero_tanda}`);
        }
      }
    }

    await EventLog.create({
      type: existingTanda ? 'tanda_aircraft_added' : 'tanda_created',
      entity: 'flight',
      entityId: String(numero_tanda),
      userId: req.user?.userId,
      payload: { numero_tanda, fecha_hora, hora_prevista, aircraftIds },
    });

    res.json({
      message: existingTanda ? 'Aviones agregados a la tanda exitosamente' : 'Tanda creada exitosamente',
      flights: createdFlights,
    });
  } catch (error: any) {
    logger.error('Error en createTanda:', error);
    res.status(500).json({ error: 'Error al crear tanda' });
  }
};

// Eliminar tanda completa
export const deleteTanda = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { numero_tanda } = req.params;

    const { Flight } = await import('../models');
    const flights = await Flight.find({ numero_tanda: Number(numero_tanda) });

    if (flights.length === 0) {
      res.status(404).json({ error: 'Tanda no encontrada' });
      return;
    }

    // Verificar que ningún vuelo tenga pasajeros inscritos
    const flightsWithPassengers = flights.filter(f => f.asientos_ocupados > 0);
    if (flightsWithPassengers.length > 0) {
      res.status(400).json({
        error: `No se puede eliminar la tanda. ${flightsWithPassengers.length} vuelo(s) tienen pasajeros inscritos.`,
      });
      return;
    }

    // Eliminar todos los vuelos de la tanda
    await Flight.deleteMany({ numero_tanda: Number(numero_tanda) });

    await EventLog.create({
      type: 'tanda_deleted',
      entity: 'flight',
      entityId: numero_tanda,
      userId: req.user?.userId,
      payload: { numero_tanda },
    });

    res.json({ message: 'Tanda eliminada exitosamente' });
  } catch (error: any) {
    logger.error('Error en deleteTanda:', error);
    res.status(500).json({ error: 'Error al eliminar tanda' });
  }
};
