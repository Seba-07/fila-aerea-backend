import mongoose from 'mongoose';
import { Notification, User } from '../models';
import dotenv from 'dotenv';

dotenv.config();

const checkNotifications = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Conectado a MongoDB');

    // Obtener todas las notificaciones
    const notifications = await Notification.find().populate('userId', 'nombre email rol').sort({ createdAt: -1 });
    console.log(`\nTotal de notificaciones: ${notifications.length}`);

    // Filtrar por tipo
    const byType: any = {};
    notifications.forEach(n => {
      if (!byType[n.tipo]) byType[n.tipo] = 0;
      byType[n.tipo]++;
    });

    console.log('\n=== NOTIFICACIONES POR TIPO ===');
    Object.keys(byType).forEach(tipo => {
      console.log(`${tipo}: ${byType[tipo]}`);
    });

    // Mostrar notificaciones de reabastecimiento
    const refuelingNotifs = notifications.filter(n => n.tipo === 'reabastecimiento_pendiente');
    console.log(`\n=== NOTIFICACIONES DE REABASTECIMIENTO (${refuelingNotifs.length}) ===`);
    refuelingNotifs.forEach(n => {
      const user = n.userId as any;
      console.log({
        id: n._id,
        usuario: user ? `${user.nombre} (${user.rol})` : 'Usuario eliminado',
        titulo: n.titulo,
        mensaje: n.mensaje,
        leido: n.leido,
        metadata: n.metadata,
        fecha: n.createdAt,
      });
    });

    // Verificar usuarios staff
    const staffUsers = await User.find({ rol: 'staff' });
    console.log(`\n=== USUARIOS STAFF (${staffUsers.length}) ===`);
    staffUsers.forEach(u => {
      console.log(`${u.nombre} (${u.email}) - ID: ${u._id}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkNotifications();
