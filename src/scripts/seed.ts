import 'dotenv/config';
import mongoose from 'mongoose';
import { User, Aircraft, Flight, Ticket, FlightManifest } from '../models';
import { logger } from '../utils/logger';

const seed = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI no definida');
    }

    await mongoose.connect(mongoUri);
    logger.info('✅ Conectado a MongoDB');

    // Limpiar datos existentes y colecciones (para eliminar índices viejos)
    const collections = await mongoose.connection.db.listCollections().toArray();
    for (const collection of collections) {
      await mongoose.connection.db.dropCollection(collection.name);
    }

    logger.info('🗑️  Datos anteriores eliminados');

    // Crear solo usuario staff
    const staff = await User.create({
      nombre: 'Staff',
      apellido: 'Usuario',
      email: 'staff@cac.cl',
      verificado: true,
      rol: 'staff',
    });

    logger.info(`✅ 1 usuario staff creado`);

    // Crear aviones Cessna 172
    const aircraft1 = await Aircraft.create({
      matricula: 'CC-PAT',
      modelo: 'Cessna 172',
      capacidad: 3,
    });

    const aircraft2 = await Aircraft.create({
      matricula: 'CC-SKE',
      modelo: 'Cessna 172',
      capacidad: 3,
    });

    logger.info('✅ 2 aviones Cessna 172 creados (CC-PAT, CC-SKE)');

    // Crear tandas/vuelos para hoy
    const now = new Date();
    const vuelos = [];

    // Crear 10 tandas para CC-PAT
    for (let i = 1; i <= 10; i++) {
      vuelos.push({
        aircraftId: aircraft1._id,
        numero_tanda: i,
        fecha_hora: new Date(now.getTime() + i * 15 * 60 * 1000), // Cada 15 min
        capacidad_total: 3,
        asientos_ocupados: 0,
        estado: i <= 2 ? 'abierto' : 'programado',
      });
    }

    // Crear 10 tandas para CC-SKE
    for (let i = 1; i <= 10; i++) {
      vuelos.push({
        aircraftId: aircraft2._id,
        numero_tanda: i,
        fecha_hora: new Date(now.getTime() + i * 15 * 60 * 1000), // Cada 15 min
        capacidad_total: 3,
        asientos_ocupados: 0,
        estado: i <= 2 ? 'abierto' : 'programado',
      });
    }

    const flightsCreated = await Flight.insertMany(vuelos);
    logger.info(`✅ ${flightsCreated.length} tandas creadas (10 por avión)`);

    // No crear pasajeros ni tickets - el staff los creará desde la UI
    logger.info('✅ Sin pasajeros - usar panel staff para crear');

    logger.info('\n📋 RESUMEN:');
    logger.info(`   - 1 usuario staff`);
    logger.info(`   - 2 Cessna 172 (CC-PAT y CC-SKE, capacidad 3 c/u)`);
    logger.info(`   - ${flightsCreated.length} tandas programadas`);
    logger.info(`   - 0 pasajeros (crear desde panel staff)`);
    logger.info('\n🔐 CREDENCIALES:');
    logger.info('   Staff: staff@cac.cl');
    logger.info('\n💡 Usar panel staff para registrar nuevos pasajeros con tickets\n');

    process.exit(0);
  } catch (error) {
    console.error('Error en seed:', error);
    logger.error('Error en seed:', error);
    process.exit(1);
  }
};

seed();
