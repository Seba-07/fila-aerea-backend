import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Settings, Flight } from '../models';
import { logger } from '../utils/logger';
import { sendPushNotification } from '../services/pushNotification';

// Obtener configuración global
export const getSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let settings = await Settings.findOne();

    // Si no existe, crear configuración por defecto
    if (!settings) {
      settings = await Settings.create({
        duracion_tanda_minutos: 20,
        max_tandas_sin_reabastecimiento_default: 4,
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
    const { duracion_tanda_minutos, max_tandas_sin_reabastecimiento_default, hora_inicio_primera_tanda } = req.body;

    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create(req.body);
    } else {
      if (duracion_tanda_minutos !== undefined) settings.duracion_tanda_minutos = duracion_tanda_minutos;
      if (max_tandas_sin_reabastecimiento_default !== undefined)
        settings.max_tandas_sin_reabastecimiento_default = max_tandas_sin_reabastecimiento_default;
      if (hora_inicio_primera_tanda !== undefined) settings.hora_inicio_primera_tanda = hora_inicio_primera_tanda;

      await settings.save();
    }

    // Si se actualizó la hora de inicio, recalcular todas las horas previstas
    if (hora_inicio_primera_tanda) {
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
    if (!settings || !settings.hora_inicio_primera_tanda) {
      logger.warn('No hay hora de inicio configurada, no se pueden calcular horas previstas');
      return;
    }

    const duracionTanda = settings.duracion_tanda_minutos;

    // Obtener todos los vuelos ordenados por tanda
    const flights = await Flight.find({ estado: { $in: ['abierto', 'en_vuelo'] } })
      .sort({ numero_tanda: 1 })
      .populate('aircraftId');

    let horaActual = new Date(settings.hora_inicio_primera_tanda);

    for (const flight of flights) {
      const horaAnterior = flight.hora_prevista_salida ? new Date(flight.hora_prevista_salida) : null;

      flight.hora_prevista_salida = new Date(horaActual);
      await flight.save();

      // Si cambió la hora, notificar a pasajeros
      if (horaAnterior && horaAnterior.getTime() !== horaActual.getTime()) {
        await notificarCambioHora(flight, horaAnterior, horaActual);
      }

      // Incrementar hora para la siguiente tanda
      horaActual = new Date(horaActual.getTime() + duracionTanda * 60 * 1000);
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

    const horaAnteriorStr = horaAnterior.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const horaNuevaStr = horaNueva.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    for (const ticket of tickets) {
      // Crear notificación
      await Notification.create({
        userId: ticket.userId,
        tipo: 'cambio_hora',
        titulo: 'Cambio de Hora de Vuelo',
        mensaje: `Tu vuelo de la tanda ${flight.numero_tanda} cambió su hora de salida de ${horaAnteriorStr} a ${horaNuevaStr}.`,
        metadata: {
          ticketId: ticket._id.toString(),
          numero_tanda: flight.numero_tanda,
          hora_anterior: horaAnterior,
          hora_nueva: horaNueva,
        },
      });

      // Enviar push notification
      await sendPushNotification(
        ticket.userId.toString(),
        '⏰ Cambio de Hora de Vuelo',
        `Tanda ${flight.numero_tanda}: ${horaAnteriorStr} → ${horaNuevaStr}`,
        {
          ticketId: ticket._id.toString(),
          numero_tanda: flight.numero_tanda,
        }
      );
    }

    logger.info(`Notificados ${tickets.length} pasajeros sobre cambio de hora en tanda ${flight.numero_tanda}`);
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

// Iniciar vuelo (cambiar estado a en_vuelo)
export const iniciarVuelo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { flightId } = req.params;

    const flight = await Flight.findById(flightId);

    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    if (flight.estado !== 'abierto') {
      res.status(400).json({ error: 'El vuelo no está en estado abierto' });
      return;
    }

    flight.estado = 'en_vuelo';
    flight.hora_inicio_vuelo = new Date();
    await flight.save();

    logger.info(`Vuelo ${flightId} iniciado (tanda ${flight.numero_tanda})`);

    res.json({ message: 'Vuelo iniciado', flight });
  } catch (error: any) {
    logger.error('Error en iniciarVuelo:', error);
    res.status(500).json({ error: 'Error al iniciar vuelo' });
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

    flight.estado = 'finalizado';
    flight.hora_arribo = new Date();
    await flight.save();

    logger.info(`Vuelo ${flightId} finalizado (tanda ${flight.numero_tanda})`);

    // Recalcular horas de vuelos siguientes
    await recalcularHorasSiguientes(flight.numero_tanda, flight.hora_arribo);

    res.json({ message: 'Vuelo finalizado', flight });
  } catch (error: any) {
    logger.error('Error en finalizarVuelo:', error);
    res.status(500).json({ error: 'Error al finalizar vuelo' });
  }
};

// Recalcular horas de vuelos siguientes después de un arribo
const recalcularHorasSiguientes = async (tandaActual: number, horaArribo: Date) => {
  try {
    const settings = await Settings.findOne();
    if (!settings) return;

    const duracionTanda = settings.duracion_tanda_minutos;

    // Obtener vuelos siguientes (tandas mayores) que aún no han volado
    const vuelosSiguientes = await Flight.find({
      numero_tanda: { $gt: tandaActual },
      estado: { $in: ['abierto'] },
    })
      .sort({ numero_tanda: 1 })
      .populate('aircraftId');

    // Calcular hora de inicio de la siguiente tanda (arribo + duración de tanda)
    let horaSiguiente = new Date(horaArribo.getTime() + duracionTanda * 60 * 1000);

    for (const vuelo of vuelosSiguientes) {
      const horaAnterior = vuelo.hora_prevista_salida ? new Date(vuelo.hora_prevista_salida) : null;

      vuelo.hora_prevista_salida = new Date(horaSiguiente);
      await vuelo.save();

      // Notificar si cambió la hora
      if (horaAnterior && horaAnterior.getTime() !== horaSiguiente.getTime()) {
        await notificarCambioHora(vuelo, horaAnterior, horaSiguiente);
      }

      // Incrementar para la siguiente
      horaSiguiente = new Date(horaSiguiente.getTime() + duracionTanda * 60 * 1000);
    }

    logger.info(`Recalculadas ${vuelosSiguientes.length} horas después de tanda ${tandaActual}`);
  } catch (error) {
    logger.error('Error recalculando horas siguientes:', error);
  }
};
