import mongoose from 'mongoose';
import { Ticket } from '../src/models';
import { logger } from '../src/utils/logger';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fila_aerea';

async function migrateTicketStates() {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('Conectado a MongoDB');

    // Actualizar tickets con estado 'asignado' o 'embarcado'
    // Si tienen flightId -> 'inscrito', sino -> 'disponible'
    
    const ticketsAsignados = await Ticket.find({ 
      estado: { $in: ['asignado', 'embarcado'] } 
    });

    logger.info(`Encontrados ${ticketsAsignados.length} tickets con estados antiguos`);

    for (const ticket of ticketsAsignados) {
      const oldEstado = ticket.estado;
      
      if (ticket.flightId) {
        ticket.estado = 'inscrito';
      } else {
        ticket.estado = 'disponible';
      }
      
      await ticket.save();
      logger.info(`Ticket ${ticket._id}: ${oldEstado} -> ${ticket.estado} (flightId: ${ticket.flightId || 'ninguno'})`);
    }

    logger.info('✅ Migración completada');
    process.exit(0);
  } catch (error) {
    logger.error('Error en migración:', error);
    process.exit(1);
  }
}

migrateTicketStates();
