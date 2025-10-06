import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Aircraft, Flight } from '../models';
import { logger } from '../utils/logger';
import { EventLog } from '../models/EventLog';

// Obtener todos los aviones
export const getAircrafts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { includeDisabled } = req.query;
    const filter: any = includeDisabled === 'true' ? {} : { habilitado: true };
    const aircrafts = await Aircraft.find(filter).sort({ matricula: 1 });
    res.json(aircrafts);
  } catch (error: any) {
    logger.error('Error en getAircrafts:', error);
    res.status(500).json({ error: 'Error al obtener aviones' });
  }
};

// Crear nuevo avión
export const createAircraft = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { matricula, modelo, capacidad } = req.body;

    if (!matricula || !modelo || !capacidad) {
      res.status(400).json({
        error: 'Matrícula, modelo y capacidad son obligatorios',
      });
      return;
    }

    if (capacidad < 1 || capacidad > 10) {
      res.status(400).json({
        error: 'La capacidad debe estar entre 1 y 10 asientos',
      });
      return;
    }

    const existingAircraft = await Aircraft.findOne({ matricula });
    if (existingAircraft) {
      res.status(400).json({ error: 'Ya existe un avión con esta matrícula' });
      return;
    }

    const aircraft = await Aircraft.create({
      matricula,
      modelo,
      capacidad,
      habilitado: true,
    });

    await EventLog.create({
      type: 'aircraft_created',
      entity: 'aircraft',
      entityId: aircraft._id.toString(),
      userId: req.user?.userId,
      payload: { matricula, modelo, capacidad },
    });

    res.json({ message: 'Avión creado exitosamente', aircraft });
  } catch (error: any) {
    logger.error('Error en createAircraft:', error);
    res.status(500).json({ error: 'Error al crear avión' });
  }
};

// Deshabilitar avión (no se puede eliminar si tiene vuelos realizados)
export const toggleAircraftStatus = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { aircraftId } = req.params;

    const aircraft = await Aircraft.findById(aircraftId);
    if (!aircraft) {
      res.status(404).json({ error: 'Avión no encontrado' });
      return;
    }

    // Verificar si tiene vuelos realizados
    const flightsWithAircraft = await Flight.find({
      aircraftId,
      estado: { $in: ['boarding', 'en_vuelo', 'finalizado'] },
    });

    if (flightsWithAircraft.length > 0 && aircraft.habilitado) {
      res.status(400).json({
        error: `No se puede deshabilitar el avión. Tiene ${flightsWithAircraft.length} vuelo(s) realizados o en curso.`,
        suggestion: 'Se recomienda mantenerlo en la base de datos pero deshabilitado.',
      });
      return;
    }

    aircraft.habilitado = !aircraft.habilitado;
    await aircraft.save();

    await EventLog.create({
      type: 'aircraft_status_toggled',
      entity: 'aircraft',
      entityId: aircraftId,
      userId: req.user?.userId,
      payload: { habilitado: aircraft.habilitado },
    });

    res.json({
      message: aircraft.habilitado ? 'Avión habilitado' : 'Avión deshabilitado',
      aircraft,
    });
  } catch (error: any) {
    logger.error('Error en toggleAircraftStatus:', error);
    res.status(500).json({ error: 'Error al cambiar estado del avión' });
  }
};

// Actualizar capacidad de un avión
export const updateAircraftCapacity = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { aircraftId } = req.params;
    const { capacidad } = req.body;

    if (!capacidad || capacidad < 1 || capacidad > 10) {
      res.status(400).json({
        error: 'La capacidad debe estar entre 1 y 10 asientos',
      });
      return;
    }

    const aircraft = await Aircraft.findById(aircraftId);
    if (!aircraft) {
      res.status(404).json({ error: 'Avión no encontrado' });
      return;
    }

    const oldCapacity = aircraft.capacidad;
    aircraft.capacidad = capacidad;
    await aircraft.save();

    // Actualizar capacidad_total de vuelos no realizados (programado o abierto)
    const vuelosActualizables = await Flight.find({
      aircraftId,
      estado: { $in: ['programado', 'abierto'] },
    });

    for (const vuelo of vuelosActualizables) {
      // Solo actualizar si la nueva capacidad es mayor o igual a los asientos ocupados
      if (capacidad >= vuelo.asientos_ocupados) {
        vuelo.capacidad_total = capacidad;
        await vuelo.save();
      }
    }

    await EventLog.create({
      type: 'aircraft_capacity_updated',
      entity: 'aircraft',
      entityId: aircraftId,
      userId: req.user?.userId,
      payload: {
        old_capacity: oldCapacity,
        new_capacity: capacidad,
        flights_updated: vuelosActualizables.length,
      },
    });

    res.json({
      message: 'Capacidad actualizada exitosamente',
      aircraft,
      flights_updated: vuelosActualizables.length,
    });
  } catch (error: any) {
    logger.error('Error en updateAircraftCapacity:', error);
    res.status(500).json({ error: 'Error al actualizar capacidad del avión' });
  }
};
