import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Flight, Ticket } from '../models';
import { logger } from '../utils/logger';

export const fixInfantSeats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Temporal: permitir sin autenticación para corrección única
    // if (req.user?.rol !== 'staff') {
    //   res.status(403).json({ error: 'No autorizado' });
    //   return;
    // }

    const flights = await Flight.find({ estado: { $ne: 'finalizado' } });

    logger.info(`Revisando ${flights.length} vuelos...`);

    const results: any[] = [];
    let totalCorregidos = 0;

    for (const flight of flights) {
      const tickets = await Ticket.find({
        flightId: flight._id,
        estado: 'inscrito'
      });

      let infantesCount = 0;
      let pasajerosNormalesCount = 0;

      for (const ticket of tickets) {
        const esInfante = ticket.pasajeros[0]?.esInfante === true;
        if (esInfante) {
          infantesCount++;
        } else {
          pasajerosNormalesCount++;
        }
      }

      const asientosOcupadosEsperados = pasajerosNormalesCount;
      const asientosOcupadosActuales = flight.asientos_ocupados;
      const flightName = `${flight.aerodromo_salida}-${flight.aerodromo_llegada}`;

      if (asientosOcupadosActuales !== asientosOcupadosEsperados) {
        results.push({
          vuelo: flightName,
          circuito: flight.numero_circuito,
          antes: asientosOcupadosActuales,
          despues: asientosOcupadosEsperados,
          normales: pasajerosNormalesCount,
          infantes: infantesCount,
          corregido: true
        });

        flight.asientos_ocupados = asientosOcupadosEsperados;
        await flight.save();
        totalCorregidos++;
      } else {
        results.push({
          vuelo: flightName,
          circuito: flight.numero_circuito,
          asientos: asientosOcupadosActuales,
          normales: pasajerosNormalesCount,
          infantes: infantesCount,
          corregido: false
        });
      }
    }

    logger.info(`✓ Proceso completado. ${totalCorregidos} vuelos corregidos.`);

    res.json({
      message: `Proceso completado. ${totalCorregidos} vuelos corregidos de ${flights.length} revisados.`,
      results
    });
  } catch (error: any) {
    logger.error('Error en fixInfantSeats:', error);
    res.status(500).json({ error: error.message || 'Error al corregir asientos' });
  }
};
