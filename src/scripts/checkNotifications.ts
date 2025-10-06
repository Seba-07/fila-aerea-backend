import mongoose from 'mongoose';
import { Notification } from '../models';
import dotenv from 'dotenv';

dotenv.config();

const checkNotifications = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Conectado a MongoDB');

    const notifications = await Notification.find({
      tipo: 'reabastecimiento_pendiente',
    }).lean();

    console.log('Total notificaciones:', notifications.length);

    notifications.forEach((notif, idx) => {
      console.log('---');
      console.log('Notif', idx + 1);
      console.log('Leido:', notif.leido);
      console.log('aircraftId:', notif.metadata?.aircraftId);
      console.log('typeof:', typeof notif.metadata?.aircraftId);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkNotifications();
