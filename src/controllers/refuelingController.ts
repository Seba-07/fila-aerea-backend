import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Refueling, Aircraft } from '../models';
import { logger } from '../utils/logger';
import { EventLog } from '../models/EventLog';

// Registrar reabastecimiento
export const createRefueling = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { aircraftId, litros, costo, notas } = req.body;

    if (!aircraftId || !litros) {
      res.status(400).json({
        error: 'Avión y litros son obligatorios',
      });
      return;
    }

    const aircraft = await Aircraft.findById(aircraftId);
    if (!aircraft) {
      res.status(404).json({ error: 'Avión no encontrado' });
      return;
    }

    const refueling = await Refueling.create({
      aircraftId,
      litros,
      costo,
      notas,
      registradoPor: req.user?.userId,
    });

    // Marcar como leídas todas las notificaciones de reabastecimiento pendiente para este avión
    const { Notification } = await import('../models');

    const aircraftIdString = String(aircraftId);
    logger.info('Marcando notificaciones como leídas para aircraftId:', aircraftIdString);

    // Buscar notificaciones que coincidan con el aircraftId (formato nuevo o viejo)
    const notificationsToUpdate = await Notification.find({
      tipo: 'reabastecimiento_pendiente',
      leido: false,
    });

    let updatedCount = 0;
    for (const notif of notificationsToUpdate) {
      const metadataAircraftId = notif.metadata?.aircraftId;

      // Verificar si coincide (string directo o string que contiene el ObjectId)
      if (
        metadataAircraftId === aircraftIdString ||
        (typeof metadataAircraftId === 'string' && metadataAircraftId.includes(aircraftIdString))
      ) {
        notif.leido = true;
        await notif.save();
        updatedCount++;
      }
    }

    logger.info(`Notificaciones actualizadas: ${updatedCount}`);

    await EventLog.create({
      type: 'refueling_registered',
      entity: 'refueling',
      entityId: refueling._id.toString(),
      userId: req.user?.userId,
      payload: { aircraftId, litros, costo },
    });

    res.json({
      message: 'Reabastecimiento registrado exitosamente',
      refueling,
    });
  } catch (error: any) {
    logger.error('Error en createRefueling:', error);
    res.status(500).json({ error: 'Error al registrar reabastecimiento' });
  }
};

// Obtener historial de reabastecimientos por avión
export const getRefuelingsByAircraft = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { aircraftId } = req.params;

    const refuelings = await Refueling.find({ aircraftId })
      .populate('registradoPor', 'nombre email')
      .sort({ fecha: -1 });

    // Calcular estadísticas
    const totalLitros = refuelings.reduce((sum, r) => sum + r.litros, 0);
    const totalCosto = refuelings.reduce((sum, r) => sum + (r.costo || 0), 0);
    const cantidadReabastecimientos = refuelings.length;

    res.json({
      refuelings,
      estadisticas: {
        total_litros: totalLitros,
        total_costo: totalCosto,
        cantidad_reabastecimientos: cantidadReabastecimientos,
        promedio_litros: cantidadReabastecimientos > 0 ? totalLitros / cantidadReabastecimientos : 0,
      },
    });
  } catch (error: any) {
    logger.error('Error en getRefuelingsByAircraft:', error);
    res.status(500).json({ error: 'Error al obtener reabastecimientos' });
  }
};

// Obtener todos los reabastecimientos
export const getAllRefuelings = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const refuelings = await Refueling.find()
      .populate('aircraftId', 'matricula modelo')
      .populate('registradoPor', 'nombre email')
      .sort({ fecha: -1 })
      .limit(100);

    res.json(refuelings);
  } catch (error: any) {
    logger.error('Error en getAllRefuelings:', error);
    res.status(500).json({ error: 'Error al obtener reabastecimientos' });
  }
};
