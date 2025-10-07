import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User, Ticket, Flight, Aircraft, Notification, EventLog, Payment, Refueling, PushSubscription, Settings, FlightManifest } from '../models';
import { logger } from '../utils/logger';

dotenv.config();

const cleanDatabase = async () => {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI no está definida en las variables de entorno');
    }

    await mongoose.connect(mongoUri);
    logger.info('✅ Conectado a MongoDB');

    // Limpiar todas las colecciones
    await User.deleteMany({});
    logger.info('🗑️  Usuarios eliminados');

    await Ticket.deleteMany({});
    logger.info('🗑️  Tickets eliminados');

    await Flight.deleteMany({});
    logger.info('🗑️  Vuelos eliminados');

    await Aircraft.deleteMany({});
    logger.info('🗑️  Aviones eliminados');

    await Notification.deleteMany({});
    logger.info('🗑️  Notificaciones eliminadas');

    await EventLog.deleteMany({});
    logger.info('🗑️  Logs de eventos eliminados');

    await Payment.deleteMany({});
    logger.info('🗑️  Pagos eliminados');

    await Refueling.deleteMany({});
    logger.info('🗑️  Reabastecimientos eliminados');

    await PushSubscription.deleteMany({});
    logger.info('🗑️  Suscripciones push eliminadas');

    await Settings.deleteMany({});
    logger.info('🗑️  Configuraciones eliminadas');

    await FlightManifest.deleteMany({});
    logger.info('🗑️  Manifiestos de vuelo eliminados');

    logger.info('');
    logger.info('✅ ¡Base de datos limpiada exitosamente!');
    logger.info('🚀 Puedes iniciar las pruebas desde cero');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Error al limpiar la base de datos:', error);
    process.exit(1);
  }
};

cleanDatabase();
