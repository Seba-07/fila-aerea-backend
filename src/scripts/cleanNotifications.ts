import mongoose from 'mongoose';
import { Notification } from '../models';
import dotenv from 'dotenv';

dotenv.config();

const cleanNotifications = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Conectado a MongoDB');

    // Eliminar todas las notificaciones de reabastecimiento pendiente
    const result = await Notification.deleteMany({
      tipo: 'reabastecimiento_pendiente',
    });

    console.log(`✅ ${result.deletedCount} notificaciones de reabastecimiento eliminadas`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

cleanNotifications();
