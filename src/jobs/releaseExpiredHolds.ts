import cron from 'node-cron';
import { Seat } from '../models';
import { logger } from '../utils/logger';
import { getIO } from '../sockets';

export const startReleaseExpiredHolds = (): void => {
  // Ejecutar cada 30 segundos
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const now = new Date();

      // Buscar asientos con hold expirado
      const expiredSeats = await Seat.find({
        status: 'hold',
        hold_expires_at: { $lt: now },
      });

      if (expiredSeats.length === 0) return;

      logger.info(`⏰ Liberando ${expiredSeats.length} asientos con hold expirado`);

      const io = getIO();

      for (const seat of expiredSeats) {
        seat.status = 'libre';
        seat.ticketId = undefined;
        seat.hold_expires_at = undefined;
        await seat.save();

        // Emitir evento de actualización
        io.to(`flight:${seat.flightId}`).emit('seatUpdated', {
          flightId: seat.flightId,
          seatNumber: seat.seatNumber,
          status: 'libre',
        });
      }

      logger.info(`✅ ${expiredSeats.length} asientos liberados`);
    } catch (error) {
      logger.error('❌ Error al liberar holds expirados:', error);
    }
  });

  logger.info('✅ Job de liberación de holds iniciado (cada 30s)');
};
