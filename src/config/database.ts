import mongoose from 'mongoose';
import { logger } from '../utils/logger';

export const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI no está definida en las variables de entorno');
    }

    await mongoose.connect(mongoUri);

    logger.info('✅ MongoDB conectado exitosamente');

    mongoose.connection.on('error', (error) => {
      logger.error('❌ Error de conexión MongoDB:', error);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️  MongoDB desconectado');
    });
  } catch (error) {
    logger.error('❌ Error al conectar con MongoDB:', error);
    process.exit(1);
  }
};
