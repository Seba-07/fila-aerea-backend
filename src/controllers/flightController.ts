import { Response, Request } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Flight, Aircraft, Ticket, EventLog, Settings, Reservation } from '../models';
import { logger } from '../utils/logger';
import { getIO } from '../sockets';

// Crear nuevo vuelo
export const createFlight = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { aircraftId, numero_circuito, fecha_hora } = req.body;

    if (!aircraftId || !numero_circuito || !fecha_hora) {
      res.status(400).json({ error: 'aircraftId, numero_circuito y fecha_hora son requeridos' });
      return;
    }

    // Verificar que el avión existe
    const aircraft = await Aircraft.findById(aircraftId);
    if (!aircraft) {
      res.status(404).json({ error: 'Avión no encontrado' });
      return;
    }

    // Verificar si ya existe un vuelo para este avión en este circuito
    const existingFlight = await Flight.findOne({
      aircraftId,
      numero_circuito,
      estado: { $in: ['abierto', 'en_vuelo'] },
    });

    if (existingFlight) {
      res.status(400).json({
        error: `El avión ${aircraft.matricula} ya tiene un vuelo programado en el circuito ${numero_circuito}`,
      });
      return;
    }

    // Verificar alerta de combustible: ¿cuántos circuitos consecutivos lleva este avión?
    const settings = await Settings.findOne();
    const maxCircuitos = aircraft.max_circuitos_sin_reabastecimiento || settings?.max_circuitos_sin_reabastecimiento_default || 4;

    // Buscar el último reabastecimiento de este avión
    const { Refueling } = await import('../models');
    const ultimoReabastecimiento = await Refueling.findOne({ aircraftId })
      .sort({ createdAt: -1 })
      .lean();

    let circuitosConsecutivos = 0;

    if (ultimoReabastecimiento) {
      // Contar vuelos finalizados desde el último reabastecimiento
      const vuelosDesdeReabastecimiento = await Flight.countDocuments({
        aircraftId,
        estado: 'finalizado',
        createdAt: { $gt: ultimoReabastecimiento.createdAt },
      });
      circuitosConsecutivos = vuelosDesdeReabastecimiento + 1; // +1 por el vuelo que se va a crear
    } else {
      // Si no hay reabastecimientos, contar todos los vuelos del avión
      const vuelosTotales = await Flight.countDocuments({
        aircraftId,
        estado: { $in: ['abierto', 'en_vuelo', 'finalizado'] },
      });
      circuitosConsecutivos = vuelosTotales + 1;
    }

    // Calcular hora_prevista_salida automáticamente
    let hora_prevista_salida: Date | undefined;

    if (settings && settings.hora_inicio_primer_circuito) {
      const duracionCircuito = settings.duracion_circuito_minutos;

      // Si es la circuito1, usar la hora de inicio configurada
      if (numero_circuito === 1) {
        hora_prevista_salida = new Date(settings.hora_inicio_primer_circuito);
      } else {
        // Buscar el último vuelo finalizado
        const ultimoVueloFinalizado = await Flight.findOne({ estado: 'finalizado' })
          .sort({ hora_arribo: -1 })
          .lean();

        if (ultimoVueloFinalizado && ultimoVueloFinalizado.hora_arribo) {
          // Calcular desde el último arribo + duración de circuito
          hora_prevista_salida = new Date(
            ultimoVueloFinalizado.hora_arribo.getTime() + duracionCircuito * 60 * 1000
          );
        } else {
          // Si no hay vuelos finalizados, calcular desde la hora inicial + (tanda - 1) * duración
          hora_prevista_salida = new Date(
            settings.hora_inicio_primer_circuito.getTime() + (numero_circuito - 1) * duracionCircuito * 60 * 1000
          );
        }
      }
    }

    // Crear el vuelo
    const flight = await Flight.create({
      aircraftId,
      numero_circuito,
      fecha_hora: new Date(fecha_hora),
      hora_prevista_salida,
      capacidad_total: aircraft.capacidad,
      asientos_ocupados: 0,
      estado: 'abierto',
    });

    await EventLog.create({
      type: 'flight_created',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: { numero_circuito, matricula: aircraft.matricula },
    });

    logger.info(`Vuelo creado: circuito${numero_circuito}, avión ${aircraft.matricula}`);

    // Verificar alerta de combustible
    let alertaCombustible = null;
    if (circuitosConsecutivos >= maxCircuitos) {
      alertaCombustible = {
        mensaje: `⚠️ El avión ${aircraft.matricula} está alcanzando el límite de circuitos consecutivas sin reabastecimiento`,
        circuitosConsecutivos,
        maxCircuitos,
      };

      logger.warn(
        `Alerta de combustible: ${aircraft.matricula} lleva ${circuitosConsecutivos} circuitos consecutivos (máx: ${maxCircuitos})`
      );
    }

    res.status(201).json({
      message: 'Vuelo creado exitosamente',
      flight,
      alertaCombustible,
    });
  } catch (error: any) {
    logger.error('Error en createFlight:', error);
    res.status(500).json({ error: 'Error al crear vuelo' });
  }
};

export const getFlights = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { estado } = req.query;

    const filter: any = {};
    if (estado) {
      if (Array.isArray(estado)) {
        filter.estado = { $in: estado };
      } else {
        filter.estado = estado;
      }
    } else {
      // Por defecto mostrar vuelos abiertos y en vuelo (no finalizados ni reprogramados)
      filter.estado = { $in: ['abierto', 'en_vuelo'] };
    }

    const flights = await Flight.find(filter)
      .populate('aircraftId', 'matricula modelo capacidad')
      .sort({ fecha_hora: 1 })
      .lean();

    // Obtener pasajeros inscritos para cada vuelo
    const flightsWithData = await Promise.all(
      flights.map(async (flight) => {
        const tickets = await Ticket.find({
          flightId: flight._id,
          estado: { $in: ['asignado', 'inscrito', 'embarcado', 'volado'] }
        }).populate('userId', 'nombre email');

        const pasajeros = tickets.map(t => ({
          ticketId: t._id,
          pasajeros: t.pasajeros,
          usuario: {
            nombre: (t.userId as any)?.nombre,
            email: (t.userId as any)?.email,
          },
          estado: t.estado,
        }));

        return {
          ...flight,
          asientos_disponibles: flight.capacidad_total - flight.asientos_ocupados,
          pasajeros_inscritos: pasajeros,
        };
      })
    );

    res.json(flightsWithData);
  } catch (error: any) {
    logger.error('Error en getFlights:', error);
    res.status(500).json({ error: 'Error al obtener vuelos' });
  }
};

export const getFlightById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const flight = await Flight.findById(id)
      .populate('aircraftId', 'matricula modelo capacidad')
      .lean();

    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    const asientos_disponibles = flight.capacidad_total - flight.asientos_ocupados;

    res.json({
      ...flight,
      asientos_disponibles,
    });
  } catch (error: any) {
    logger.error('Error en getFlightById:', error);
    res.status(500).json({ error: 'Error al obtener vuelo' });
  }
};

export const updateFlightStatus = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const flight = await Flight.findById(id);
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    flight.estado = estado;
    await flight.save();

    await EventLog.create({
      type: 'flight_status_updated',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: { estado },
    });

    const io = getIO();
    io.emit('flightUpdated', {
      flightId: flight._id,
      estado: flight.estado,
    });

    res.json({ message: 'Estado actualizado', flight });
  } catch (error: any) {
    logger.error('Error en updateFlightStatus:', error);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
};

export const updateFlightCapacity = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { capacidad_total } = req.body;

    if (!capacidad_total || capacidad_total < 1) {
      res.status(400).json({ error: 'Capacidad debe ser mayor a 0' });
      return;
    }

    const flight = await Flight.findById(id);
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    if (capacidad_total < flight.asientos_ocupados) {
      res.status(400).json({
        error: `No se puede reducir la capacidad a ${capacidad_total}. Ya hay ${flight.asientos_ocupados} asientos ocupados.`,
      });
      return;
    }

    const oldCapacity = flight.capacidad_total;
    flight.capacidad_total = capacidad_total;
    await flight.save();

    await EventLog.create({
      type: 'flight_capacity_updated',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: { old_capacity: oldCapacity, new_capacity: capacidad_total },
    });

    const io = getIO();
    io.emit('flightUpdated', {
      flightId: flight._id,
      capacidad_total: flight.capacidad_total,
    });

    res.json({ message: 'Capacidad actualizada', flight });
  } catch (error: any) {
    logger.error('Error en updateFlightCapacity:', error);
    res.status(500).json({ error: 'Error al actualizar capacidad' });
  }
};

export const rescheduleFlightToNextCircuito = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { razon } = req.body;

    if (!razon || !['combustible', 'meteorologia', 'mantenimiento'].includes(razon)) {
      res.status(400).json({
        error: 'Debes especificar una razón válida: combustible, meteorologia o mantenimiento',
      });
      return;
    }

    const flight = await Flight.findById(id).populate('aircraftId');
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    // Verificar que el vuelo esté abierto
    if (flight.estado !== 'abierto') {
      res.status(400).json({
        error: 'Solo se pueden reprogramar vuelos en estado abierto',
      });
      return;
    }

    const aircraftId = flight.aircraftId;
    const circuitoActual = flight.numero_circuito;

    // Buscar la siguiente circuito(sin importar el avión)
    const anyNextCircuito = await Flight.findOne({
      numero_circuito: { $gt: circuitoActual },
      estado: 'abierto',
    }).sort({ numero_circuito: 1 });

    if (!anyNextCircuito) {
      res.status(404).json({
        error: 'No hay circuitos siguientes disponibles',
      });
      return;
    }

    let circuitoSiguiente = anyNextCircuito.numero_circuito;
    let nuevoCircuitoCreado = false;
    let circuitoDesplazado = null;

    // Verificar si este avión ya tiene un vuelo en la siguiente tanda
    let nextCircuitoFlight = await Flight.findOne({
      aircraftId,
      numero_circuito: circuitoSiguiente,
      estado: 'abierto',
    });

    // Si el avión ya existe en la siguiente tanda, mover ese vuelo a una nueva circuito(efecto dominó)
    if (nextCircuitoFlight) {
      const { Aircraft, Ticket } = await import('../models');
      const aircraft = await Aircraft.findById(aircraftId);

      if (!aircraft) {
        res.status(404).json({ error: 'Avión no encontrado' });
        return;
      }

      // Buscar la primera circuitodisponible donde este avión NO tenga un vuelo
      let nuevoCircuitoNum = circuitoSiguiente + 1;
      let circuitoDisponibleEncontrado = false;

      while (!circuitoDisponibleEncontrado) {
        const existeVueloEnCircuito = await Flight.findOne({
          aircraftId,
          numero_circuito: nuevoCircuitoNum,
          estado: 'abierto',
        });

        if (!existeVueloEnCircuito) {
          circuitoDisponibleEncontrado = true;
        } else {
          nuevoCircuitoNum++;
        }
      }

      // Buscar la fecha de esta tanda, o usar la última + 1 hora
      const circuitoConFecha = await Flight.findOne({
        numero_circuito: nuevoCircuitoNum,
        estado: 'abierto',
      });

      let nuevaFecha: Date;
      if (circuitoConFecha) {
        nuevaFecha = circuitoConFecha.fecha_hora;
      } else {
        // Si no existe el circuito, calcular 1 hora después de la última
        const maxCircuitoFlight = await Flight.findOne().sort({ numero_circuito: -1 });
        const lastCircuitoDate = maxCircuitoFlight ? maxCircuitoFlight.fecha_hora : anyNextCircuito.fecha_hora;
        nuevaFecha = new Date(lastCircuitoDate);
        nuevaFecha.setHours(nuevaFecha.getHours() + 1);
      }

      const oldFlightId = nextCircuitoFlight._id;
      const oldCircuitoNum = nextCircuitoFlight.numero_circuito;

      // Mover el vuelo existente a la nueva tanda
      nextCircuitoFlight.numero_circuito = nuevoCircuitoNum;
      nextCircuitoFlight.fecha_hora = nuevaFecha;
      await nextCircuitoFlight.save();

      // Mover también los pasajeros de ese vuelo (si los hay)
      const ticketsDesplazados = await Ticket.find({
        flightId: oldFlightId,
        estado: { $in: ['asignado', 'inscrito'] },
      }).populate('userId');

      // Mover automáticamente a los pasajeros desplazados
      for (const ticket of ticketsDesplazados) {
        // Actualizar flightId al vuelo movido (que ahora está en la nueva tanda)
        ticket.flightId = nextCircuitoFlight._id as any;
        ticket.reprogramacion_pendiente = {
          nuevo_flightId: nextCircuitoFlight._id as any,
          numero_circuito_anterior: oldCircuitoNum,
          numero_circuito_nuevo: nuevoCircuitoNum,
          fecha_reprogramacion: new Date(),
        };
        await ticket.save();

        // Notificar al pasajero desplazado
        const { Notification } = await import('../models');
        await Notification.create({
          userId: ticket.userId,
          tipo: 'reprogramacion',
          titulo: 'Vuelo Reprogramado en Cascada',
          mensaje: `Tu vuelo de la circuito${oldCircuitoNum} ha sido reprogramado automáticamente a la circuito${nuevoCircuitoNum} debido a ajustes en la programación.`,
          metadata: {
            ticketId: ticket._id.toString(),
            circuito_anterior: oldCircuitoNum,
            circuito_nuevo: nuevoCircuitoNum,
          },
        });

        // Enviar push notification al dispositivo móvil
        const { sendPushNotification } = await import('../services/pushNotification');
        await sendPushNotification(
          ticket.userId.toString(),
          '✈️ Vuelo Reprogramado',
          `Tu vuelo de la circuito${oldCircuitoNum} ha sido reprogramado a la circuito${nuevoCircuitoNum}.`,
          {
            ticketId: ticket._id.toString(),
            circuito_anterior: oldCircuitoNum,
            circuito_nuevo: nuevoCircuitoNum,
          }
        );

        logger.info(`Ticket ${ticket._id} desplazado de circuito${oldCircuitoNum} a ${nuevoCircuitoNum}`);
      }

      logger.info(`Vuelo desplazado de circuito${oldCircuitoNum} a ${nuevoCircuitoNum} con ${ticketsDesplazados.length} pasajeros`);

      nuevoCircuitoCreado = true;
      circuitoDesplazado = {
        numero_circuito: nuevoCircuitoNum,
        matricula: aircraft.matricula,
      };

      // Ahora crear el vuelo para el avión actual en la circuitosiguiente
      nextCircuitoFlight = await Flight.create({
        aircraftId,
        numero_circuito: circuitoSiguiente,
        fecha_hora: anyNextCircuito.fecha_hora,
        capacidad_total: aircraft.capacidad,
        asientos_ocupados: 0,
        estado: 'abierto',
      });
    } else if (!nextCircuitoFlight) {
      // Si no existe, crear el vuelo para este avión en la siguiente tanda
      const { Aircraft } = await import('../models');
      const aircraft = await Aircraft.findById(aircraftId);

      if (!aircraft) {
        res.status(404).json({ error: 'Avión no encontrado' });
        return;
      }

      nextCircuitoFlight = await Flight.create({
        aircraftId,
        numero_circuito: circuitoSiguiente,
        fecha_hora: anyNextCircuito.fecha_hora,
        capacidad_total: aircraft.capacidad,
        asientos_ocupados: 0,
        estado: 'abierto',
      });
    }

    // Obtener todos los pasajeros del vuelo actual
    const { Ticket } = await import('../models');
    const ticketsAfectados = await Ticket.find({
      flightId: flight._id,
      estado: { $in: ['asignado', 'inscrito'] },
    }).populate('userId');

    // Con el efecto dominó, siempre hay espacio porque movemos el vuelo que obstruía
    // No es necesario validar espacio disponible

    // Mover pasajeros automáticamente al nuevo vuelo
    for (const ticket of ticketsAfectados) {
      // Actualizar el flightId al nuevo vuelo
      ticket.flightId = nextCircuitoFlight._id as any;
      ticket.reprogramacion_pendiente = {
        nuevo_flightId: nextCircuitoFlight._id as any,
        numero_circuito_anterior: circuitoActual,
        numero_circuito_nuevo: circuitoSiguiente,
        fecha_reprogramacion: new Date(),
      };
      await ticket.save();

      // Crear notificación para el pasajero
      const { Notification } = await import('../models');
      await Notification.create({
        userId: ticket.userId,
        tipo: 'reprogramacion',
        titulo: 'Vuelo Reprogramado',
        mensaje: `Tu vuelo de la circuito${circuitoActual} ha sido reprogramado automáticamente a la circuito${circuitoSiguiente}.`,
        metadata: {
          ticketId: ticket._id.toString(),
          circuito_anterior: circuitoActual,
          circuito_nuevo: circuitoSiguiente,
        },
      });

      // Enviar push notification al dispositivo móvil
      const { sendPushNotification } = await import('../services/pushNotification');
      await sendPushNotification(
        ticket.userId.toString(),
        '✈️ Vuelo Reprogramado',
        `Tu vuelo de la circuito${circuitoActual} ha sido reprogramado a la circuito${circuitoSiguiente}.`,
        {
          ticketId: ticket._id.toString(),
          circuito_anterior: circuitoActual,
          circuito_nuevo: circuitoSiguiente,
        }
      );

      logger.info(`Ticket ${ticket._id} movido de circuito${circuitoActual} a ${circuitoSiguiente}`);
    }

    // Actualizar contadores de asientos
    nextCircuitoFlight.asientos_ocupados += ticketsAfectados.length;
    await nextCircuitoFlight.save();

    flight.asientos_ocupados = 0; // Resetear contador del vuelo viejo
    flight.estado = 'reprogramado';
    flight.razon_reprogramacion = razon;
    await flight.save();

    logger.info(`${ticketsAfectados.length} pasajeros movidos de circuito${circuitoActual} a ${circuitoSiguiente}`);

    // Si la razón es combustible, crear notificación de reabastecimiento para staff
    if (razon === 'combustible') {
      const { User, Notification } = await import('../models');
      const staffUsers = await User.find({ rol: 'staff' });

      const aircraft = await import('../models').then(m => m.Aircraft.findById(aircraftId));

      // Convertir ObjectId a string correctamente
      const aircraftIdString = String(aircraftId);

      for (const staffUser of staffUsers) {
        await Notification.create({
          userId: staffUser._id,
          tipo: 'reabastecimiento_pendiente',
          titulo: 'Reabastecimiento Pendiente',
          mensaje: `El avión ${aircraft?.matricula} fue reprogramado por falta de combustible. Debes registrar el reabastecimiento en el sistema.`,
          metadata: {
            aircraftId: aircraftIdString,
            flightId: String(flight._id),
            matricula: aircraft?.matricula,
            razon: 'combustible',
          },
        });
      }
    }

    await EventLog.create({
      type: 'flight_rescheduled',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: {
        circuito_anterior: circuitoActual,
        circuito_nuevo: circuitoSiguiente,
        pasajeros_afectados: ticketsAfectados.length,
        nuevo_circuito_creado: nuevoCircuitoCreado,
        tanda_desplazada: circuitoDesplazado,
      },
    });

    const io = getIO();
    io.emit('flightRescheduled', {
      flightId: flight._id,
      circuito_anterior: circuitoActual,
      circuito_nuevo: circuitoSiguiente,
      nuevo_circuito_creado: nuevoCircuitoCreado,
      tanda_desplazada: circuitoDesplazado,
    });

    let message = 'Vuelo reprogramado exitosamente';
    if (nuevoCircuitoCreado && circuitoDesplazado) {
      message += `. Se creó la Circuito #${circuitoDesplazado.numero_circuito} con el vuelo ${circuitoDesplazado.matricula} que estaba en la Circuito #${circuitoSiguiente}`;
    }
    if (razon === 'combustible') {
      message += '. IMPORTANTE: Debes registrar el reabastecimiento del avión en el sistema.';
    }

    res.json({
      message,
      pasajeros_afectados: ticketsAfectados.length,
      circuito_nuevo: circuitoSiguiente,
      nuevo_circuito_creado: nuevoCircuitoCreado,
      tanda_desplazada: circuitoDesplazado,
      requiere_reabastecimiento: razon === 'combustible',
      tickets: ticketsAfectados.map(t => ({
        ticketId: t._id,
        pasajero: t.pasajeros[0]?.nombre,
        usuario: (t.userId as any).nombre,
      })),
    });
  } catch (error: any) {
    logger.error('Error en rescheduleFlight:', error);
    res.status(500).json({ error: 'Error al reprogramar vuelo' });
  }
};

export const cancelAircraftForDay = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const flight = await Flight.findById(id).populate('aircraftId');
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    const aircraftId = flight.aircraftId;
    const circuitoActual = flight.numero_circuito;

    // Buscar todos los vuelos del mismo avión en tandas futuras (mismo día o posteriores)
    const futureFlights = await Flight.find({
      aircraftId,
      numero_circuito: { $gte: circuitoActual },
      estado: 'abierto',
    }).sort({ numero_circuito: 1 });

    if (futureFlights.length === 0) {
      res.status(404).json({ error: 'No hay vuelos futuros para cancelar' });
      return;
    }

    // Obtener todos los tickets afectados de todos los vuelos
    const { Ticket, Notification } = await import('../models');
    let totalTicketsAfectados = 0;

    for (const futFlight of futureFlights) {
      const ticketsAfectados = await Ticket.find({
        flightId: futFlight._id,
        estado: { $in: ['asignado', 'inscrito'] },
      }).populate('userId');

      // Liberar tickets
      for (const ticket of ticketsAfectados) {
        ticket.estado = 'disponible';
        ticket.flightId = undefined;
        await ticket.save();

        // Notificar al pasajero
        await Notification.create({
          userId: ticket.userId,
          tipo: 'cancelacion',
          titulo: 'Vuelo Cancelado',
          mensaje: `El avión ${(aircraftId as any).matricula} ha sido cancelado para el resto del día. Tu ticket ha sido liberado y puedes inscribirte en otro vuelo.`,
          metadata: {
            ticketId: ticket._id.toString(),
            circuito_cancelado: futFlight.numero_circuito,
            avion: (aircraftId as any).matricula,
          },
        });

        totalTicketsAfectados++;
      }

      // Marcar vuelo como cancelado
      futFlight.estado = 'cancelado';
      futFlight.razon_reprogramacion = 'cancelacion_dia';
      futFlight.asientos_ocupados = 0;
      await futFlight.save();
    }

    await EventLog.create({
      type: 'aircraft_cancelled_for_day',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: {
        aircraftId: String(aircraftId),
        vuelos_cancelados: futureFlights.length,
        pasajeros_afectados: totalTicketsAfectados,
      },
    });

    const io = getIO();
    io.emit('aircraftCancelledForDay', {
      aircraftId,
      vuelos_cancelados: futureFlights.map(f => f._id),
    });

    res.json({
      message: `Avión cancelado por el día. ${futureFlights.length} vuelo(s) cancelado(s)`,
      vuelos_cancelados: futureFlights.length,
      pasajeros_afectados: totalTicketsAfectados,
    });
  } catch (error: any) {
    logger.error('Error en cancelAircraftForDay:', error);
    res.status(500).json({ error: 'Error al cancelar avión' });
  }
};

export const deleteFlight = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const flight = await Flight.findById(id);
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    // Verificar que el vuelo no tenga pasajeros
    if (flight.asientos_ocupados > 0) {
      res.status(400).json({
        error: 'No se puede eliminar un vuelo con pasajeros inscritos',
      });
      return;
    }

    await Flight.findByIdAndDelete(id);

    await EventLog.create({
      type: 'flight_deleted',
      entity: 'flight',
      entityId: id,
      userId: req.user?.userId,
      payload: {
        numero_circuito: flight.numero_circuito,
        aircraftId: flight.aircraftId,
      },
    });

    const io = getIO();
    io.emit('flightDeleted', { flightId: id });

    res.json({ message: 'Vuelo eliminado exitosamente' });
  } catch (error: any) {
    logger.error('Error en deleteFlight:', error);
    res.status(500).json({ error: 'Error al eliminar vuelo' });
  }
};

// ========== RESERVATION SYSTEM ==========

// Get all available flights (PUBLIC - no authentication required)
export const getAvailableFlights = async (req: Request, res: Response): Promise<void> => {
  try {
    const flights = await Flight.find({
      estado: 'abierto',
      $expr: { $lt: ['$asientos_ocupados', '$capacidad_total'] }
    })
      .populate('aircraftId', 'matricula modelo capacidad')
      .sort({ fecha_hora: 1 })
      .lean();

    const flightsWithAvailability = flights.map(flight => ({
      ...flight,
      asientos_disponibles: flight.capacidad_total - flight.asientos_ocupados,
    }));

    res.json(flightsWithAvailability);
  } catch (error: any) {
    logger.error('Error en getAvailableFlights:', error);
    res.status(500).json({ error: 'Error al obtener vuelos disponibles' });
  }
};

// Create a temporary 5-minute reservation (PUBLIC - no authentication required)
export const createReservation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { flightId, cantidadPasajeros } = req.body;

    if (!flightId || !cantidadPasajeros || cantidadPasajeros < 1) {
      res.status(400).json({ error: 'flightId y cantidadPasajeros son requeridos' });
      return;
    }

    // Find flight and check availability
    const flight = await Flight.findById(flightId);
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    if (flight.estado !== 'abierto') {
      res.status(400).json({ error: 'El vuelo no está disponible para reservas' });
      return;
    }

    const asientosDisponibles = flight.capacidad_total - flight.asientos_ocupados;
    if (asientosDisponibles < cantidadPasajeros) {
      res.status(400).json({
        error: `Solo hay ${asientosDisponibles} asientos disponibles`
      });
      return;
    }

    // Create reservation with 10-minute expiration
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    const reservation = await Reservation.create({
      flightId,
      cantidadPasajeros,
      status: 'active',
      expiresAt,
    });

    // Temporarily increment asientos_ocupados (soft lock)
    flight.asientos_ocupados += cantidadPasajeros;
    await flight.save();

    logger.info(`Reserva creada: ${reservation._id} - Vuelo: ${flightId} - ${cantidadPasajeros} asientos - Expira: ${expiresAt}`);

    // Emit socket event for real-time updates
    const io = getIO();
    io.emit('flightUpdated', {
      flightId: flight._id,
      asientos_ocupados: flight.asientos_ocupados,
      asientos_disponibles: flight.capacidad_total - flight.asientos_ocupados,
    });

    res.status(201).json({
      message: 'Reserva creada exitosamente',
      reservation: {
        id: reservation._id,
        flightId: reservation.flightId,
        cantidadPasajeros: reservation.cantidadPasajeros,
        expiresAt: reservation.expiresAt,
        status: reservation.status,
      },
    });
  } catch (error: any) {
    logger.error('Error en createReservation:', error);
    res.status(500).json({ error: 'Error al crear reserva' });
  }
};

// Get reservation by ID (PUBLIC - no authentication required)
export const getReservation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const reservation = await Reservation.findById(id).populate('flightId', 'numero_circuito fecha_hora capacidad_total asientos_ocupados');

    if (!reservation) {
      res.status(404).json({ error: 'Reserva no encontrada' });
      return;
    }

    // Check if reservation has expired
    const now = new Date();
    if (reservation.status === 'active' && reservation.expiresAt < now) {
      reservation.status = 'expired';
      await reservation.save();

      // Decrement flight asientos_ocupados
      const flight = await Flight.findById(reservation.flightId);
      if (flight) {
        flight.asientos_ocupados = Math.max(0, flight.asientos_ocupados - reservation.cantidadPasajeros);
        await flight.save();

        // Emit socket event
        const io = getIO();
        io.emit('flightUpdated', {
          flightId: flight._id,
          asientos_ocupados: flight.asientos_ocupados,
          asientos_disponibles: flight.capacidad_total - flight.asientos_ocupados,
        });
      }

      logger.info(`Reserva expirada: ${reservation._id}`);
    }

    res.json({
      reservation: {
        id: reservation._id,
        flightId: reservation.flightId,
        cantidadPasajeros: reservation.cantidadPasajeros,
        expiresAt: reservation.expiresAt,
        status: reservation.status,
        createdAt: reservation.createdAt,
      },
    });
  } catch (error: any) {
    logger.error('Error en getReservation:', error);
    res.status(500).json({ error: 'Error al obtener reserva' });
  }
};

// Release/cancel a reservation (PUBLIC - no authentication required)
export const releaseReservation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reservationId } = req.body;

    if (!reservationId) {
      res.status(400).json({ error: 'reservationId es requerido' });
      return;
    }

    const reservation = await Reservation.findById(reservationId);

    if (!reservation) {
      res.status(404).json({ error: 'Reserva no encontrada' });
      return;
    }

    if (reservation.status !== 'active') {
      res.status(400).json({ error: 'Solo se pueden cancelar reservas activas' });
      return;
    }

    // Mark reservation as cancelled
    reservation.status = 'cancelled';
    await reservation.save();

    // Decrement flight asientos_ocupados
    const flight = await Flight.findById(reservation.flightId);
    if (flight) {
      flight.asientos_ocupados = Math.max(0, flight.asientos_ocupados - reservation.cantidadPasajeros);
      await flight.save();

      // Emit socket event
      const io = getIO();
      io.emit('flightUpdated', {
        flightId: flight._id,
        asientos_ocupados: flight.asientos_ocupados,
        asientos_disponibles: flight.capacidad_total - flight.asientos_ocupados,
      });

      logger.info(`Reserva cancelada: ${reservation._id} - ${reservation.cantidadPasajeros} asientos liberados`);
    }

    res.json({
      message: 'Reserva cancelada exitosamente',
      reservation: {
        id: reservation._id,
        status: reservation.status,
      },
    });
  } catch (error: any) {
    logger.error('Error en releaseReservation:', error);
    res.status(500).json({ error: 'Error al cancelar reserva' });
  }
};

// Background cleanup job - expires old reservations
export const cleanupExpiredReservations = async (): Promise<void> => {
  try {
    const now = new Date();

    // Find all active reservations that have expired
    const expiredReservations = await Reservation.find({
      status: 'active',
      expiresAt: { $lt: now },
    });

    if (expiredReservations.length === 0) {
      return;
    }

    logger.info(`Limpiando ${expiredReservations.length} reservas expiradas...`);

    for (const reservation of expiredReservations) {
      // Mark as expired
      reservation.status = 'expired';
      await reservation.save();

      // Decrement flight asientos_ocupados
      const flight = await Flight.findById(reservation.flightId);
      if (flight) {
        flight.asientos_ocupados = Math.max(0, flight.asientos_ocupados - reservation.cantidadPasajeros);
        await flight.save();

        // Emit socket event
        const io = getIO();
        io.emit('flightUpdated', {
          flightId: flight._id,
          asientos_ocupados: flight.asientos_ocupados,
          asientos_disponibles: flight.capacidad_total - flight.asientos_ocupados,
        });
      }

      logger.info(`Reserva expirada automáticamente: ${reservation._id}`);
    }

    logger.info(`✓ ${expiredReservations.length} reservas expiradas procesadas`);
  } catch (error: any) {
    logger.error('Error en cleanupExpiredReservations:', error);
  }
};
