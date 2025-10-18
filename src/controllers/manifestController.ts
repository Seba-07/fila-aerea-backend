import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { FlightManifest, Flight } from '../models';
import { logger } from '../utils/logger';

// Listar todos los manifiestos (uno por vuelo)
export const getManifests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const manifests = await FlightManifest.find()
      .populate('flightId')
      .populate('createdBy', 'nombre apellido email')
      .sort({ numero_circuito: -1, createdAt: -1 });

    const { Ticket } = await import('../models');

    // Enriquecer cada manifiesto con información del vuelo
    const manifestsEnriquecidos = await Promise.all(
      manifests.map(async (manifest) => {
        const flight = manifest.flightId as any;

        if (!flight) {
          return manifest.toObject();
        }

        // Poblar aircraft y pilot si no están poblados
        await flight.populate('aircraftId');
        await flight.populate('pilotId');

        const ticketsCount = await Ticket.countDocuments({
          flightId: flight._id,
          estado: { $in: ['inscrito', 'embarcado', 'asignado'] },
        });

        return {
          ...manifest.toObject(),
          vuelo: {
            flightId: flight._id,
            matricula: flight.aircraftId?.matricula,
            modelo: flight.aircraftId?.modelo,
            estado: flight.estado,
            piloto_nombre: flight.pilotId?.nombre || flight.piloto_nombre || 'Sin asignar',
            piloto_licencia: flight.pilotId?.numero_licencia || 'N/A',
            pasajeros_count: ticketsCount,
          },
        };
      })
    );

    res.json(manifestsEnriquecidos);
  } catch (error: any) {
    logger.error('Error en getManifests:', error);
    res.status(500).json({ error: 'Error al obtener manifiestos' });
  }
};

// Obtener un manifiesto específico por flightId
export const getManifestByFlight = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { flightId } = req.params;

    const manifest = await FlightManifest.findOne({ flightId })
      .populate('flightId')
      .populate('createdBy', 'nombre apellido email');

    if (!manifest) {
      res.status(404).json({ error: 'Manifiesto no encontrado' });
      return;
    }

    const flight = manifest.flightId as any;
    await flight.populate('aircraftId');
    await flight.populate('pilotId');

    const { Ticket } = await import('../models');

    const tickets = await Ticket.find({
      flightId: flight._id,
      estado: { $in: ['inscrito', 'embarcado', 'asignado'] },
    });

    const pasajeros = tickets
      .filter(t => t.pasajeros && t.pasajeros.length > 0)
      .map(t => ({
        nombre: `${t.pasajeros[0].nombre} ${t.pasajeros[0].apellido}`,
        rut: t.pasajeros[0].rut || 'Sin RUT',
        esMenor: t.pasajeros[0].esMenor || false,
        autorizacion_url: t.pasajeros[0].autorizacion_url || null,
        estado: t.estado,
      }));

    const vueloDetalle = {
      flightId: flight._id,
      matricula: flight.aircraftId?.matricula,
      modelo: flight.aircraftId?.modelo,
      estado: flight.estado,
      piloto_nombre: flight.pilotId?.nombre || flight.piloto_nombre || 'Sin asignar',
      piloto_licencia: flight.pilotId?.numero_licencia || 'N/A',
      pilotId: flight.pilotId?._id || null,
      aerodromo_salida: flight.aerodromo_salida || 'SCST',
      aerodromo_llegada: flight.aerodromo_llegada || 'SCST',
      pasajeros,
    };

    res.json({
      ...manifest.toObject(),
      vuelo: vueloDetalle,
    });
  } catch (error: any) {
    logger.error('Error en getManifestByFlight:', error);
    res.status(500).json({ error: 'Error al obtener manifiesto' });
  }
};

// DEPRECATED: Mantener por compatibilidad, usar getManifestByFlight
export const getManifestByCircuito = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { numeroCircuito } = req.params;

    // Buscar el primer manifiesto del circuito
    const manifest = await FlightManifest.findOne({ numero_circuito: parseInt(numeroCircuito) })
      .populate('flightId')
      .populate('createdBy', 'nombre apellido email');

    if (!manifest) {
      res.status(404).json({ error: 'Manifiesto no encontrado' });
      return;
    }

    // Redirigir al nuevo formato
    req.params.flightId = (manifest.flightId as any)._id.toString();
    return getManifestByFlight(req, res);
  } catch (error: any) {
    logger.error('Error en getManifestByCircuito:', error);
    res.status(500).json({ error: 'Error al obtener manifiesto' });
  }
};
