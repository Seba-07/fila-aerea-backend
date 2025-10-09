import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Settings, Flight } from '../models';
import { logger } from '../utils/logger';
import { sendPushNotification } from '../services/pushNotification';
import { getIO } from '../sockets';

// Obtener solo el precio del ticket (público - para página de compra)
export const getPrecioTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    let settings = await Settings.findOne();

    // Si no existe, crear configuración por defecto
    if (!settings) {
      settings = await Settings.create({
        duracion_circuito_minutos: 30,
        max_circuitos_sin_reabastecimiento_default: 4,
        precio_ticket: 25000,
      });
    }

    res.json({ precio_ticket: settings.precio_ticket });
  } catch (error: any) {
    logger.error('Error en getPrecioTicket:', error);
    res.status(500).json({ error: 'Error al obtener precio del ticket' });
  }
};

// Obtener configuración global
export const getSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let settings = await Settings.findOne();

    // Si no existe, crear configuración por defecto
    if (!settings) {
      settings = await Settings.create({
        duracion_circuito_minutos: 30,
        max_circuitos_sin_reabastecimiento_default: 4,
        precio_ticket: 25000,
      });
    }

    res.json(settings);
  } catch (error: any) {
    logger.error('Error en getSettings:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

// Actualizar configuración global
export const updateSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { duracion_circuito_minutos, max_circuitos_sin_reabastecimiento_default, hora_inicio_primer_circuito, precio_ticket } = req.body;

    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create(req.body);
    } else {
      if (duracion_circuito_minutos !== undefined) settings.duracion_circuito_minutos = duracion_circuito_minutos;
      if (max_circuitos_sin_reabastecimiento_default !== undefined)
        settings.max_circuitos_sin_reabastecimiento_default = max_circuitos_sin_reabastecimiento_default;
      if (hora_inicio_primer_circuito !== undefined) settings.hora_inicio_primer_circuito = hora_inicio_primer_circuito;
      if (precio_ticket !== undefined) settings.precio_ticket = precio_ticket;

      await settings.save();
    }

    // Si se actualizó la hora de inicio, recalcular todas las horas previstas
    if (hora_inicio_primer_circuito) {
      await recalcularTodasLasHorasPrevistas();
    }

    res.json({ message: 'Configuración actualizada', settings });
  } catch (error: any) {
    logger.error('Error en updateSettings:', error);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
};

// Recalcular todas las horas previstas desde la primera tanda
const recalcularTodasLasHorasPrevistas = async () => {
  try {
    const settings = await Settings.findOne();
    if (!settings || !settings.hora_inicio_primer_circuito) {
      logger.warn('No hay hora de inicio configurada, no se pueden calcular horas previstas');
      return;
    }

    const duracionCircuito = settings.duracion_circuito_minutos;

    // Obtener todos los vuelos ordenados por tanda
    const flights = await Flight.find({ estado: { $in: ['abierto', 'en_vuelo'] } })
      .sort({ numero_circuito: 1 })
      .populate('aircraftId');

    let horaActual = new Date(settings.hora_inicio_primer_circuito);

    for (const flight of flights) {
      const horaAnterior = flight.hora_prevista_salida ? new Date(flight.hora_prevista_salida) : null;

      flight.hora_prevista_salida = new Date(horaActual);
      await flight.save();

      // Si cambió la hora, notificar a pasajeros
      if (horaAnterior && horaAnterior.getTime() !== horaActual.getTime()) {
        await notificarCambioHora(flight, horaAnterior, horaActual);
      }

      // Incrementar hora para la siguiente tanda
      horaActual = new Date(horaActual.getTime() + duracionCircuito * 60 * 1000);
    }

    logger.info(`Recalculadas ${flights.length} horas previstas de vuelo`);
  } catch (error) {
    logger.error('Error recalculando horas previstas:', error);
  }
};

// Notificar a pasajeros inscritos sobre cambio de hora
const notificarCambioHora = async (flight: any, horaAnterior: Date, horaNueva: Date) => {
  try {
    const { Ticket, Notification } = await import('../models');

    // Obtener tickets inscritos en este vuelo
    const tickets = await Ticket.find({
      flightId: flight._id,
      estado: 'inscrito',
    }).populate('userId');

    // Formatear horas usando UTC para mostrar correctamente
    const horaAnteriorStr = `${String(horaAnterior.getUTCHours()).padStart(2, '0')}:${String(horaAnterior.getUTCMinutes()).padStart(2, '0')}`;
    const horaNuevaStr = `${String(horaNueva.getUTCHours()).padStart(2, '0')}:${String(horaNueva.getUTCMinutes()).padStart(2, '0')}`;

    for (const ticket of tickets) {
      // Marcar ticket con cambio de hora pendiente
      ticket.cambio_hora_pendiente = {
        hora_anterior: horaAnterior,
        hora_nueva: horaNueva,
        fecha_cambio: new Date(),
      };
      await ticket.save();

      // Crear notificación
      await Notification.create({
        userId: ticket.userId,
        tipo: 'cambio_hora',
        titulo: 'Cambio de Hora de Vuelo',
        mensaje: `Tu vuelo de la circuito${flight.numero_circuito} cambió su hora de salida de ${horaAnteriorStr} a ${horaNuevaStr}. Por favor acepta o rechaza el cambio.`,
        metadata: {
          ticketId: ticket._id.toString(),
          numero_circuito: flight.numero_circuito,
          hora_anterior: horaAnterior,
          hora_nueva: horaNueva,
        },
      });

      // Enviar push notification
      await sendPushNotification(
        ticket.userId.toString(),
        '⏰ Cambio de Hora de Vuelo',
        `Circuito ${flight.numero_circuito}: ${horaAnteriorStr} → ${horaNuevaStr}. Acepta o rechaza el cambio.`,
        {
          ticketId: ticket._id.toString(),
          numero_circuito: flight.numero_circuito,
          tipo: 'cambio_hora',
        }
      );

      // Emitir evento de socket para actualizar frontend en tiempo real
      const io = getIO();
      io.to(`user:${ticket.userId.toString()}`).emit('timeChanged', {
        ticketId: ticket._id.toString(),
        numero_circuito: flight.numero_circuito,
        hora_anterior: horaAnteriorStr,
        hora_nueva: horaNuevaStr,
        cambio_hora_pendiente: ticket.cambio_hora_pendiente,
      });
    }

    logger.info(`Notificados ${tickets.length} pasajeros sobre cambio de hora en circuito${flight.numero_circuito}`);
  } catch (error) {
    logger.error('Error notificando cambio de hora:', error);
  }
};

// Actualizar hora prevista de un vuelo específico
export const updateHoraPrevista = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { flightId } = req.params;
    const { hora_prevista_salida } = req.body;

    const flight = await Flight.findById(flightId);

    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    const horaAnterior = flight.hora_prevista_salida ? new Date(flight.hora_prevista_salida) : null;
    const horaNueva = new Date(hora_prevista_salida);

    flight.hora_prevista_salida = horaNueva;
    await flight.save();

    // Notificar a pasajeros si cambió
    if (horaAnterior && horaAnterior.getTime() !== horaNueva.getTime()) {
      await notificarCambioHora(flight, horaAnterior, horaNueva);
    }

    res.json({ message: 'Hora prevista actualizada', flight });
  } catch (error: any) {
    logger.error('Error en updateHoraPrevista:', error);
    res.status(500).json({ error: 'Error al actualizar hora prevista' });
  }
};

// Actualizar hora prevista de toda una circuitocon efecto cascada
export const updateHoraPrevistaCircuito = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { numeroCircuito } = req.params;
    const { nueva_hora } = req.body; // Formato "HH:MM"

    const circuitoNum = parseInt(numeroCircuito);

    // Obtener todos los vuelos de esta tanda
    const vuelosCircuito = await Flight.find({ numero_circuito: circuitoNum });

    if (vuelosCircuito.length === 0) {
      res.status(404).json({ error: 'Circuito no encontrado' });
      return;
    }

    // Crear fecha completa con la nueva hora usando UTC
    const fechaBase = new Date(vuelosCircuito[0].fecha_hora);
    const [horas, minutos] = nueva_hora.split(':');

    // Crear la fecha usando UTC para guardar 15:00 como 15:00 UTC en la BD
    const primeraFecha = new Date(Date.UTC(
      fechaBase.getUTCFullYear(),
      fechaBase.getUTCMonth(),
      fechaBase.getUTCDate(),
      parseInt(horas),
      parseInt(minutos),
      0,
      0
    ));

    // Actualizar todos los vuelos de el circuito
    for (const vuelo of vuelosCircuito) {
      const horaAnterior = vuelo.hora_prevista_salida ? new Date(vuelo.hora_prevista_salida) : null;
      vuelo.hora_prevista_salida = new Date(primeraFecha);
      await vuelo.save();

      // Notificar si cambió
      if (horaAnterior && horaAnterior.getTime() !== primeraFecha.getTime()) {
        await notificarCambioHora(vuelo, horaAnterior, primeraFecha);
      }
    }

    // Recalcular las tandas siguientes
    await recalcularCircuitosSiguientes(circuitoNum, primeraFecha);

    logger.info(`Actualizada hora prevista de circuito${circuitoNum} a ${nueva_hora} y recalculadas tandas siguientes`);

    res.json({
      message: 'Hora prevista actualizada con efecto cascada',
      vuelos_actualizados: vuelosCircuito.length
    });
  } catch (error: any) {
    logger.error('Error en updateHoraPrevistaCircuito:', error);
    res.status(500).json({ error: 'Error al actualizar hora prevista de circuito' });
  }
};

// Recalcular tandas siguientes después de cambio de hora en una tanda
const recalcularCircuitosSiguientes = async (circuitoActual: number, nuevaHora: Date) => {
  try {
    const settings = await Settings.findOne();
    if (!settings) return;

    const duracionCircuito = settings.duracion_circuito_minutos;

    // Obtener todas las tandas siguientes (agrupadas)
    const vuelosSiguientes = await Flight.find({
      numero_circuito: { $gt: circuitoActual },
      estado: { $in: ['abierto', 'en_vuelo'] },
    }).sort({ numero_circuito: 1 });

    if (vuelosSiguientes.length === 0) return;

    // Calcular hora incrementalmente para cada tanda
    let circuitoAnterior = circuitoActual;
    let horaActual = new Date(nuevaHora);

    for (const vuelo of vuelosSiguientes) {
      // Si cambiamos de circuito, incrementar la hora
      if (vuelo.numero_circuito !== circuitoAnterior) {
        // Calcular cuántas tandas avanzamos
        const saltoCircuitos = vuelo.numero_circuito - circuitoAnterior;
        // Sumar la duración por cada tanda
        horaActual = new Date(horaActual.getTime() + (duracionCircuito * saltoCircuitos * 60 * 1000));
        circuitoAnterior = vuelo.numero_circuito;
      }

      const horaAnterior = vuelo.hora_prevista_salida ? new Date(vuelo.hora_prevista_salida) : null;
      vuelo.hora_prevista_salida = new Date(horaActual);
      await vuelo.save();

      // Notificar si cambió
      if (horaAnterior && horaAnterior.getTime() !== horaActual.getTime()) {
        await notificarCambioHora(vuelo, horaAnterior, horaActual);
      }
    }

    logger.info(`Recalculadas ${vuelosSiguientes.length} horas de vuelos siguientes a circuito${circuitoActual}`);
  } catch (error) {
    logger.error('Error recalculando tandas siguientes:', error);
  }
};

// Iniciar vuelo (cambiar estado a en_vuelo)
export const iniciarVuelo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { flightId } = req.params;

    const flight = await Flight.findById(flightId).populate('aircraftId');

    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    if (flight.estado !== 'abierto') {
      res.status(400).json({ error: 'El vuelo no está en estado abierto' });
      return;
    }

    // Obtener configuración de zona horaria
    const settings = await Settings.findOne();
    const timezoneOffset = settings?.timezone_offset_hours || 3;

    // Convertir hora actual a zona horaria local
    const now = new Date();
    const horaInicio = new Date(now.getTime() - (timezoneOffset * 60 * 60 * 1000));

    flight.estado = 'en_vuelo';
    flight.hora_inicio_vuelo = horaInicio;
    await flight.save();

    // Generar manifiesto para toda la circuito(solo una vez por tanda)
    await generarManifiestoCircuito(flight.numero_circuito, req.user!.userId);

    logger.info(`Vuelo ${flightId} iniciado (tanda ${flight.numero_circuito})`);

    res.json({ message: 'Vuelo iniciado y manifiesto generado', flight });
  } catch (error: any) {
    logger.error('Error en iniciarVuelo:', error);
    res.status(500).json({ error: 'Error al iniciar vuelo' });
  }
};

// Generar manifiesto para una circuitocompleta
const generarManifiestoCircuito = async (numeroCircuito: number, userId: string) => {
  try {
    const { FlightManifest, Ticket } = await import('../models');

    // Verificar si ya existe un manifiesto para esta tanda
    const existente = await FlightManifest.findOne({ numero_circuito: numeroCircuito });
    if (existente) {
      logger.info(`Manifiesto ya existe para circuito${numeroCircuito}`);
      return;
    }

    // Obtener todos los vuelos de el circuito
    const vuelosCircuito = await Flight.find({ numero_circuito: numeroCircuito })
      .populate('aircraftId')
      .sort({ 'aircraftId.matricula': 1 });

    if (vuelosCircuito.length === 0) return;

    // Para cada vuelo, obtener los pasajeros inscritos
    const manifiestosPorVuelo = [];
    for (const vuelo of vuelosCircuito) {
      // Buscar tickets inscritos o asignados a este vuelo
      const tickets = await Ticket.find({
        flightId: vuelo._id,
        estado: { $in: ['inscrito', 'asignado'] },
      }).populate('userId');

      logger.info(`Vuelo ${vuelo._id} (${(vuelo.aircraftId as any)?.matricula}): ${tickets.length} tickets encontrados`);

      const pasajeros = tickets
        .filter(t => t.pasajeros && t.pasajeros.length > 0)
        .map(t => ({
          nombre: `${t.pasajeros[0].nombre} ${t.pasajeros[0].apellido}`,
          rut: t.pasajeros[0].rut || 'Sin RUT',
          esMenor: t.pasajeros[0].esMenor || false,
          ticketId: t._id,
        }));

      logger.info(`Vuelo ${vuelo._id}: ${pasajeros.length} pasajeros con datos`);

      manifiestosPorVuelo.push({
        flightId: vuelo._id,
        matricula: (vuelo.aircraftId as any).matricula,
        modelo: (vuelo.aircraftId as any).modelo,
        pasajeros,
      });
    }

    // Crear un manifiesto para el primer vuelo de la circuito(representando toda el circuito)
    const primerVuelo = vuelosCircuito[0];
    const todosLosPasajeros = manifiestosPorVuelo.flatMap(m => m.pasajeros);

    await FlightManifest.create({
      flightId: primerVuelo._id,
      numero_circuito: numeroCircuito,
      pasajeros: todosLosPasajeros,
      fecha_vuelo: primerVuelo.fecha_hora,
      hora_despegue: primerVuelo.hora_inicio_vuelo || new Date(),
      createdBy: userId,
    });

    logger.info(`✅ Manifiesto creado para circuito${numeroCircuito} con ${todosLosPasajeros.length} pasajeros total`);
  } catch (error) {
    logger.error('Error generando manifiesto:', error);
  }
};

// Finalizar vuelo (cambiar estado a finalizado y recalcular horas siguientes)
export const finalizarVuelo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { flightId } = req.params;

    const flight = await Flight.findById(flightId).populate('aircraftId');

    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    if (flight.estado !== 'en_vuelo') {
      res.status(400).json({ error: 'El vuelo no está en vuelo' });
      return;
    }

    // Obtener configuración de zona horaria
    const settings = await Settings.findOne();
    const timezoneOffset = settings?.timezone_offset_hours || 3;

    // Obtener hora actual del servidor (UTC) y convertir a zona horaria local
    // El servidor está en UTC, pero queremos guardar la hora local
    // Si localmente son las 19:40, en UTC son las 22:40 (con offset 3)
    // Guardamos como 19:40 en UTC para que el frontend muestre 19:40
    const now = new Date();
    const horaAterrizaje = new Date(now.getTime() - (timezoneOffset * 60 * 60 * 1000));

    flight.estado = 'finalizado';
    flight.hora_arribo = horaAterrizaje;
    await flight.save();

    // Actualizar hora de aterrizaje en el manifiesto
    await actualizarHoraAterrizajeManifiesto(flight.numero_circuito, horaAterrizaje);

    logger.info(`✈️ Vuelo ${(flight.aircraftId as any)?.matricula} finalizado (tanda ${flight.numero_circuito})`);

    // Verificar si este es el último vuelo de la circuitoen finalizar
    const vuelosPendientesCircuito = await Flight.find({
      numero_circuito: flight.numero_circuito,
      estado: { $in: ['abierto', 'en_vuelo'] },
    });

    if (vuelosPendientesCircuito.length === 0) {
      // Este fue el último vuelo de el circuito, recalcular horas siguientes
      logger.info(`🏁 Último vuelo de circuito${flight.numero_circuito} finalizado a las ${horaAterrizaje.toISOString()}`);
      logger.info(`   Hora UTC: ${horaAterrizaje.toUTCString()}`);
      logger.info(`   Hora local: ${horaAterrizaje.toLocaleString('es-CL')}`);
      logger.info(`   Recalculando horas siguientes...`);
      await recalcularHorasSiguientes(flight.numero_circuito, horaAterrizaje);
    } else {
      logger.info(`⏳ Circuito ${flight.numero_circuito} aún tiene ${vuelosPendientesCircuito.length} vuelo(s) pendiente(s)`);
    }

    res.json({ message: 'Vuelo finalizado y manifiesto actualizado', flight });
  } catch (error: any) {
    logger.error('Error en finalizarVuelo:', error);
    res.status(500).json({ error: 'Error al finalizar vuelo' });
  }
};

// Actualizar hora de aterrizaje en el manifiesto de el circuito
const actualizarHoraAterrizajeManifiesto = async (numeroCircuito: number, horaAterrizaje: Date) => {
  try {
    const { FlightManifest } = await import('../models');

    const manifiesto = await FlightManifest.findOne({ numero_circuito: numeroCircuito });
    if (manifiesto) {
      manifiesto.hora_aterrizaje = horaAterrizaje;
      await manifiesto.save();
      logger.info(`Actualizada hora de aterrizaje en manifiesto de circuito${numeroCircuito}`);
    }
  } catch (error) {
    logger.error('Error actualizando hora de aterrizaje en manifiesto:', error);
  }
};

// Recalcular horas de vuelos siguientes después de un arribo
const recalcularHorasSiguientes = async (circuitoActual: number, horaArribo: Date) => {
  try {
    const settings = await Settings.findOne();
    if (!settings) return;

    const duracionCircuito = settings.duracion_circuito_minutos;

    // Obtener vuelos siguientes (tandas mayores) que aún no han volado
    const vuelosSiguientes = await Flight.find({
      numero_circuito: { $gt: circuitoActual },
      estado: { $in: ['abierto'] },
    })
      .sort({ numero_circuito: 1 })
      .populate('aircraftId');

    if (vuelosSiguientes.length === 0) {
      logger.info('No hay vuelos siguientes para recalcular');
      return;
    }

    // Agrupar vuelos por circuitopara calcular hora una sola vez por tanda
    const vuelosPorCircuito: { [key: number]: any[] } = {};
    for (const vuelo of vuelosSiguientes) {
      if (!vuelosPorCircuito[vuelo.numero_circuito]) {
        vuelosPorCircuito[vuelo.numero_circuito] = [];
      }
      vuelosPorCircuito[vuelo.numero_circuito].push(vuelo);
    }

    const numerosCircuito = Object.keys(vuelosPorCircuito).map(Number).sort((a, b) => a - b);

    for (const numeroCircuito of numerosCircuito) {
      // Calcular hora para esta tanda
      const saltoCircuitos = numeroCircuito - circuitoActual;

      logger.info(`📊 Calculando hora para circuito${numeroCircuito}:`);
      logger.info(`   Circuito actual: ${circuitoActual}, Salto: ${saltoCircuitos} tanda(s)`);
      logger.info(`   Hora aterrizaje recibida: ${horaArribo.toISOString()}`);

      let horaNueva: Date;
      if (saltoCircuitos === 1) {
        // La circuitoinmediatamente siguiente sale a la hora de aterrizaje
        horaNueva = new Date(horaArribo);
        logger.info(`   ✓ Circuito siguiente inmediata → misma hora de aterrizaje`);
      } else {
        // Circuitos más adelante: agregar duración por cada circuitointermedia
        const minutosAgregar = duracionCircuito * (saltoCircuitos - 1);
        horaNueva = new Date(horaArribo.getTime() + (minutosAgregar * 60 * 1000));
        logger.info(`   ✓ Circuito con salto → agregar ${minutosAgregar} minutos`);
      }
      logger.info(`   Hora nueva calculada: ${horaNueva.toISOString()}`);

      // Aplicar la misma hora a TODOS los vuelos de esta tanda
      for (const vuelo of vuelosPorCircuito[numeroCircuito]) {
        const horaAnterior = vuelo.hora_prevista_salida ? new Date(vuelo.hora_prevista_salida) : null;

        vuelo.hora_prevista_salida = new Date(horaNueva);
        await vuelo.save();

        logger.info(`✈️  ${(vuelo.aircraftId as any)?.matricula} (tanda ${vuelo.numero_circuito}) → ${horaNueva.toLocaleTimeString('es-CL')}`);

        // Notificar si cambió la hora
        if (horaAnterior && horaAnterior.getTime() !== horaNueva.getTime()) {
          await notificarCambioHora(vuelo, horaAnterior, horaNueva);
        }
      }
    }

    logger.info(`✅ Recalculadas ${vuelosSiguientes.length} horas de vuelo en ${numerosCircuito.length} tanda(s) después de aterrizaje de circuito${circuitoActual}`);
  } catch (error) {
    logger.error('Error recalculando horas siguientes:', error);
  }
};

// Recalcular todas las horas de circuitos manteniendo la hora del circuito #1
export const recalcularHorasCircuitos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = await Settings.findOne();
    if (!settings) {
      res.status(404).json({ error: 'Configuración no encontrada' });
      return;
    }

    // Obtener el primer circuito activo (circuito #1)
    const circuito1 = await Flight.findOne({
      numero_circuito: 1,
      estado: { $in: ['abierto', 'en_vuelo'] }
    }).sort({ numero_circuito: 1 });

    if (!circuito1 || !circuito1.hora_prevista_salida) {
      res.status(404).json({ error: 'No hay circuito #1 activo con hora prevista' });
      return;
    }

    // Usar la hora actual del circuito #1 como base para recalcular los siguientes
    const horaBase = new Date(circuito1.hora_prevista_salida);

    // Recalcular todos los circuitos siguientes manteniendo la hora del circuito #1
    await recalcularCircuitosSiguientes(1, horaBase);

    logger.info(`Recalculadas horas de circuitos manteniendo circuito #1 en ${horaBase.toISOString()}`);

    res.json({
      message: 'Horas de circuitos recalculadas exitosamente',
      circuito_base: 1,
      hora_base: horaBase
    });
  } catch (error: any) {
    logger.error('Error en recalcularHorasCircuitos:', error);
    res.status(500).json({ error: 'Error al recalcular horas de circuitos' });
  }
};
