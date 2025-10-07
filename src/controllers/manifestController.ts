import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { FlightManifest, Flight } from '../models';
import { logger } from '../utils/logger';

// Listar todos los manifiestos
export const getManifests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const manifests = await FlightManifest.find()
      .populate('flightId')
      .populate('createdBy', 'nombre apellido email')
      .sort({ numero_tanda: -1 });

    // Enriquecer con informaci�n de los vuelos de cada tanda
    const manifestsConVuelos = await Promise.all(
      manifests.map(async (manifest) => {
        // Obtener todos los vuelos de la tanda
        const vuelosTanda = await Flight.find({ numero_tanda: manifest.numero_tanda })
          .populate('aircraftId')
          .sort({ 'aircraftId.matricula': 1 });

        return {
          ...manifest.toObject(),
          vuelos: vuelosTanda.map(v => ({
            matricula: (v.aircraftId as any)?.matricula,
            modelo: (v.aircraftId as any)?.modelo,
            estado: v.estado,
          })),
        };
      })
    );

    res.json(manifestsConVuelos);
  } catch (error: any) {
    logger.error('Error en getManifests:', error);
    res.status(500).json({ error: 'Error al obtener manifiestos' });
  }
};

// Obtener un manifiesto espec�fico por tanda
export const getManifestByTanda = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { numeroTanda } = req.params;

    const manifest = await FlightManifest.findOne({ numero_tanda: parseInt(numeroTanda) })
      .populate('flightId')
      .populate('createdBy', 'nombre apellido email');

    if (!manifest) {
      res.status(404).json({ error: 'Manifiesto no encontrado' });
      return;
    }

    // Obtener informaci�n detallada de los vuelos
    const vuelosTanda = await Flight.find({ numero_tanda: parseInt(numeroTanda) })
      .populate('aircraftId')
      .sort({ 'aircraftId.matricula': 1 });

    // Organizar pasajeros por vuelo
    const vuelosConPasajeros = await Promise.all(
      vuelosTanda.map(async (vuelo) => {
        const { Ticket } = await import('../models');

        const tickets = await Ticket.find({
          flightId: vuelo._id,
          estado: 'inscrito',
        });

        const pasajeros = tickets
          .filter(t => t.pasajeros && t.pasajeros.length > 0)
          .map(t => ({
            nombre: `${t.pasajeros[0].nombre} ${t.pasajeros[0].apellido}`,
            rut: t.pasajeros[0].rut || 'Sin RUT',
            esMenor: t.pasajeros[0].esMenor || false,
          }));

        return {
          matricula: (vuelo.aircraftId as any)?.matricula,
          modelo: (vuelo.aircraftId as any)?.modelo,
          estado: vuelo.estado,
          pasajeros,
        };
      })
    );

    res.json({
      ...manifest.toObject(),
      vuelos: vuelosConPasajeros,
    });
  } catch (error: any) {
    logger.error('Error en getManifestByTanda:', error);
    res.status(500).json({ error: 'Error al obtener manifiesto' });
  }
};
