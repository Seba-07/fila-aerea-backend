import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function migrateTandaToCircuito() {
  try {
    console.log('🔄 Iniciando migración de Tanda → Circuito...');

    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI o MONGO_URI no está definida en las variables de entorno');
    }

    await mongoose.connect(mongoUri);
    console.log('✓ Conectado a MongoDB');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');

    // 1. Migrar colección "flights"
    console.log('\n📝 Migrando colección "flights"...');
    const flightsResult = await db.collection('flights').updateMany(
      { numero_tanda: { $exists: true } },
      { $rename: { numero_tanda: 'numero_circuito' } }
    );
    console.log(`✓ Flights actualizados: ${flightsResult.modifiedCount}`);

    // 2. Migrar colección "flightmanifests"
    console.log('\n📝 Migrando colección "flightmanifests"...');
    const manifestsResult = await db.collection('flightmanifests').updateMany(
      { numero_tanda: { $exists: true } },
      { $rename: { numero_tanda: 'numero_circuito' } }
    );
    console.log(`✓ Flight manifests actualizados: ${manifestsResult.modifiedCount}`);

    // 3. Migrar colección "tickets" - reprogramacion_pendiente
    console.log('\n📝 Migrando colección "tickets" (reprogramacion_pendiente)...');
    const ticketsResult = await db.collection('tickets').updateMany(
      {
        $or: [
          { 'reprogramacion_pendiente.numero_tanda_anterior': { $exists: true } },
          { 'reprogramacion_pendiente.numero_tanda_nueva': { $exists: true } }
        ]
      },
      {
        $rename: {
          'reprogramacion_pendiente.numero_tanda_anterior': 'reprogramacion_pendiente.numero_circuito_anterior',
          'reprogramacion_pendiente.numero_tanda_nueva': 'reprogramacion_pendiente.numero_circuito_nuevo'
        }
      }
    );
    console.log(`✓ Tickets actualizados: ${ticketsResult.modifiedCount}`);

    // 4. Migrar colección "settings"
    console.log('\n📝 Migrando colección "settings"...');
    const settingsResult = await db.collection('settings').updateMany(
      {},
      {
        $rename: {
          duracion_tanda_minutos: 'duracion_circuito_minutos',
          max_tandas_sin_reabastecimiento_default: 'max_circuitos_sin_reabastecimiento_default',
          hora_inicio_primera_tanda: 'hora_inicio_primer_circuito'
        }
      }
    );
    console.log(`✓ Settings actualizados: ${settingsResult.modifiedCount}`);

    // 5. Migrar colección "aircrafts"
    console.log('\n📝 Migrando colección "aircrafts"...');
    const aircraftsResult = await db.collection('aircrafts').updateMany(
      { max_tandas_sin_reabastecimiento: { $exists: true } },
      { $rename: { max_tandas_sin_reabastecimiento: 'max_circuitos_sin_reabastecimiento' } }
    );
    console.log(`✓ Aircrafts actualizados: ${aircraftsResult.modifiedCount}`);

    // 6. Migrar colección "eventlogs" - tipos de evento
    console.log('\n📝 Migrando colección "eventlogs" (event types)...');
    const eventLogsResult1 = await db.collection('eventlogs').updateMany(
      { tipo: 'tanda_created' },
      { $set: { tipo: 'circuito_created' } }
    );
    const eventLogsResult2 = await db.collection('eventlogs').updateMany(
      { tipo: 'tanda_deleted' },
      { $set: { tipo: 'circuito_deleted' } }
    );
    console.log(`✓ Event logs actualizados: ${eventLogsResult1.modifiedCount + eventLogsResult2.modifiedCount}`);

    console.log('\n✅ Migración completada exitosamente!');
    console.log('\n📊 Resumen:');
    console.log(`   - Flights: ${flightsResult.modifiedCount} documentos`);
    console.log(`   - Manifests: ${manifestsResult.modifiedCount} documentos`);
    console.log(`   - Tickets: ${ticketsResult.modifiedCount} documentos`);
    console.log(`   - Settings: ${settingsResult.modifiedCount} documentos`);
    console.log(`   - Aircrafts: ${aircraftsResult.modifiedCount} documentos`);
    console.log(`   - Event Logs: ${eventLogsResult1.modifiedCount + eventLogsResult2.modifiedCount} documentos`);

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Desconectado de MongoDB');
  }
}

// Ejecutar migración
migrateTandaToCircuito()
  .then(() => {
    console.log('\n🎉 Proceso de migración finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 La migración falló:', error);
    process.exit(1);
  });
