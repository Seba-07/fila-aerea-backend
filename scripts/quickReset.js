require('dotenv/config');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI no está configurado en .env');
  process.exit(1);
}

async function quickReset() {
  try {
    console.log('🔌 Conectando a MongoDB Atlas...');

    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });

    console.log('✓ Conectado a MongoDB');

    const db = mongoose.connection.db;

    // Buscar el admin staff
    const adminStaff = await db.collection('users').findOne({
      email: 'staff@vueloscastro.cl',
      rol: 'staff'
    });

    if (!adminStaff) {
      console.error('❌ No se encontró el usuario admin staff');
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log(`✓ Encontrado usuario admin: ${adminStaff.email}`);
    console.log('\n🗑️  Eliminando datos...\n');

    // Eliminar todos los usuarios excepto el admin
    const usersResult = await db.collection('users').deleteMany({
      _id: { $ne: adminStaff._id }
    });
    console.log(`✓ Usuarios eliminados: ${usersResult.deletedCount}`);

    // Eliminar todas las demás colecciones
    const collections = [
      'verifications',
      'tickets',
      'aircrafts',
      'flights',
      'flightmanifests',
      'notifications',
      'eventlogs',
      'payments',
      'refuelings',
      'pushsubscriptions',
      'transactions',
      'reservations',
      'pilots'
    ];

    for (const collectionName of collections) {
      try {
        const result = await db.collection(collectionName).deleteMany({});
        console.log(`✓ ${collectionName} eliminados: ${result.deletedCount}`);
      } catch (error) {
        console.log(`⚠️  ${collectionName}: ${error.message}`);
      }
    }

    console.log('\n✅ Base de datos limpiada exitosamente');
    console.log(`\n👤 Usuario admin mantenido:`);
    console.log(`   Email: ${adminStaff.email}`);
    console.log(`   Rol: ${adminStaff.rol}`);
    console.log(`   Nombre: ${adminStaff.nombre} ${adminStaff.apellido}`);

    await mongoose.connection.close();
    console.log('\n🔌 Conexión cerrada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

quickReset();
