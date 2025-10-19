import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import { Flight, Ticket } from '../models';
import { logger } from '../utils/logger';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * Script para corregir asientos ocupados en vuelos
 * Los infantes no deben ocupar asientos
 */
async function fixInfantSeats() {
  try {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!MONGO_URI) {
      throw new Error('MONGO_URI no está definida');
    }

    await mongoose.connect(MONGO_URI);
    logger.info('Conectado a MongoDB');

    // Obtener todos los vuelos que no estén finalizados
    const flights = await Flight.find({ estado: { $ne: 'finalizado' } });

    logger.info(`Revisando ${flights.length} vuelos...`);

    let totalCorregidos = 0;

    for (const flight of flights) {
      // Obtener todos los tickets inscritos en este vuelo
      const tickets = await Ticket.find({
        flightId: flight._id,
        estado: 'inscrito'
      });

      // Contar cuántos son infantes y cuántos no
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
        logger.warn(
          `Vuelo ${flightName} (Circuito ${flight.numero_circuito}): ` +
          `Asientos ocupados: ${asientosOcupadosActuales} -> ${asientosOcupadosEsperados} ` +
          `(${pasajerosNormalesCount} normales + ${infantesCount} infantes)`
        );

        flight.asientos_ocupados = asientosOcupadosEsperados;
        await flight.save();
        totalCorregidos++;
      } else {
        logger.info(
          `Vuelo ${flightName} (Circuito ${flight.numero_circuito}): ` +
          `OK - ${asientosOcupadosActuales} asientos (${pasajerosNormalesCount} normales + ${infantesCount} infantes)`
        );
      }
    }

    logger.info(`\n✓ Proceso completado. ${totalCorregidos} vuelos corregidos.`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('Error en fixInfantSeats:', error);
    logger.error('Error en fixInfantSeats:', error.message || error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixInfantSeats();
