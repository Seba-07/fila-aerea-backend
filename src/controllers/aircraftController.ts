import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Aircraft, Flight } from '../models';
import { logger } from '../utils/logger';
import { EventLog } from '../models/EventLog';

// Obtener todos los aviones
export const getAircrafts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const aircrafts = await Aircraft.find().sort({ matricula: 1 });
    res.json(aircrafts);
  } catch (error: any) {
    logger.error('Error en getAircrafts:', error);
    res.status(500).json({ error: 'Error al obtener aviones' });
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
