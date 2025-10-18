import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Pilot } from '../models';
import { logger } from '../utils/logger';

// Listar todos los pilotos activos
export const getPilots = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pilots = await Pilot.find({ activo: true }).sort({ nombre: 1 });
    res.json(pilots);
  } catch (error: any) {
    logger.error('Error en getPilots:', error);
    res.status(500).json({ error: 'Error al obtener pilotos' });
  }
};

// Crear un nuevo piloto
export const createPilot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nombre, numero_licencia } = req.body;

    if (!nombre || !numero_licencia) {
      res.status(400).json({ error: 'Nombre y número de licencia son requeridos' });
      return;
    }

    const existingPilot = await Pilot.findOne({ numero_licencia });
    if (existingPilot) {
      res.status(400).json({ error: 'Ya existe un piloto con ese número de licencia' });
      return;
    }

    const pilot = new Pilot({
      nombre,
      numero_licencia,
      activo: true,
    });

    await pilot.save();
    res.status(201).json(pilot);
  } catch (error: any) {
    logger.error('Error en createPilot:', error);
    res.status(500).json({ error: 'Error al crear piloto' });
  }
};

// Actualizar un piloto
export const updatePilot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pilotId } = req.params;
    const { nombre, numero_licencia } = req.body;

    const pilot = await Pilot.findById(pilotId);
    if (!pilot) {
      res.status(404).json({ error: 'Piloto no encontrado' });
      return;
    }

    if (numero_licencia && numero_licencia !== pilot.numero_licencia) {
      const existingPilot = await Pilot.findOne({ numero_licencia });
      if (existingPilot) {
        res.status(400).json({ error: 'Ya existe un piloto con ese número de licencia' });
        return;
      }
    }

    if (nombre) pilot.nombre = nombre;
    if (numero_licencia) pilot.numero_licencia = numero_licencia;

    await pilot.save();
    res.json(pilot);
  } catch (error: any) {
    logger.error('Error en updatePilot:', error);
    res.status(500).json({ error: 'Error al actualizar piloto' });
  }
};

// Desactivar un piloto (soft delete)
export const deletePilot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pilotId } = req.params;

    const pilot = await Pilot.findById(pilotId);
    if (!pilot) {
      res.status(404).json({ error: 'Piloto no encontrado' });
      return;
    }

    pilot.activo = false;
    await pilot.save();

    res.json({ message: 'Piloto desactivado exitosamente' });
  } catch (error: any) {
    logger.error('Error en deletePilot:', error);
    res.status(500).json({ error: 'Error al desactivar piloto' });
  }
};
