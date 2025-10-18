import 'dotenv/config';
import mongoose from 'mongoose';
import {
  User,
  Verification,
  Ticket,
  Aircraft,
  Flight,
  FlightManifest,
  Notification,
  EventLog,
  Payment,
  Refueling,
  PushSubscription,
  Settings,
  Transaction,
  Reservation,
  Pilot,
} from '../src/models';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fila-aerea';

async function resetDatabase() {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Conectado a MongoDB');

    // Buscar el usuario admin staff
    const adminStaff = await User.findOne({ email: 'staff@vueloscastro.cl', rol: 'staff' });

    if (!adminStaff) {
      console.error('❌ No se encontró el usuario admin staff (staff@vueloscastro.cl)');
      process.exit(1);
    }

    console.log(`✓ Encontrado usuario admin: ${adminStaff.email}`);
    const adminId = adminStaff._id;

    console.log('\n🗑️  Eliminando datos...\n');

    // Eliminar todos los usuarios excepto el admin
    const usersDeleted = await User.deleteMany({ _id: { $ne: adminId } });
    console.log(`✓ Usuarios eliminados: ${usersDeleted.deletedCount}`);

    // Eliminar todas las verificaciones
    const verificationsDeleted = await Verification.deleteMany({});
    console.log(`✓ Verificaciones eliminadas: ${verificationsDeleted.deletedCount}`);

    // Eliminar todos los tickets
    const ticketsDeleted = await Ticket.deleteMany({});
    console.log(`✓ Tickets eliminados: ${ticketsDeleted.deletedCount}`);

    // Eliminar todos los aviones
    const aircraftsDeleted = await Aircraft.deleteMany({});
    console.log(`✓ Aviones eliminados: ${aircraftsDeleted.deletedCount}`);

    // Eliminar todos los vuelos
    const flightsDeleted = await Flight.deleteMany({});
    console.log(`✓ Vuelos eliminados: ${flightsDeleted.deletedCount}`);

    // Eliminar todos los manifiestos
    const manifestsDeleted = await FlightManifest.deleteMany({});
    console.log(`✓ Manifiestos eliminados: ${manifestsDeleted.deletedCount}`);

    // Eliminar todas las notificaciones
    const notificationsDeleted = await Notification.deleteMany({});
    console.log(`✓ Notificaciones eliminadas: ${notificationsDeleted.deletedCount}`);

    // Eliminar todos los logs de eventos
    const eventLogsDeleted = await EventLog.deleteMany({});
    console.log(`✓ Logs de eventos eliminados: ${eventLogsDeleted.deletedCount}`);

    // Eliminar todos los pagos
    const paymentsDeleted = await Payment.deleteMany({});
    console.log(`✓ Pagos eliminados: ${paymentsDeleted.deletedCount}`);

    // Eliminar todos los reabastecimientos
    const refuelingsDeleted = await Refueling.deleteMany({});
    console.log(`✓ Reabastecimientos eliminados: ${refuelingsDeleted.deletedCount}`);

    // Eliminar todas las suscripciones push
    const pushSubscriptionsDeleted = await PushSubscription.deleteMany({});
    console.log(`✓ Suscripciones push eliminadas: ${pushSubscriptionsDeleted.deletedCount}`);

    // Eliminar todas las transacciones
    const transactionsDeleted = await Transaction.deleteMany({});
    console.log(`✓ Transacciones eliminadas: ${transactionsDeleted.deletedCount}`);

    // Eliminar todas las reservas
    const reservationsDeleted = await Reservation.deleteMany({});
    console.log(`✓ Reservas eliminadas: ${reservationsDeleted.deletedCount}`);

    // Eliminar todos los pilotos
    const pilotsDeleted = await Pilot.deleteMany({});
    console.log(`✓ Pilotos eliminados: ${pilotsDeleted.deletedCount}`);

    // Mantener Settings (configuración del sistema)
    console.log(`✓ Configuración del sistema mantenida`);

    console.log('\n✅ Base de datos limpiada exitosamente');
    console.log(`\n👤 Usuario admin mantenido:`);
    console.log(`   Email: ${adminStaff.email}`);
    console.log(`   Rol: ${adminStaff.rol}`);
    console.log(`   Nombre: ${adminStaff.nombre} ${adminStaff.apellido}`);

    await mongoose.connection.close();
    console.log('\n🔌 Conexión cerrada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al limpiar la base de datos:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

resetDatabase();
