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

    // Crear usuarios
    const usuarios = [];
    for (let i = 1; i <= 10; i++) {
      usuarios.push({
        nombre: `Usuario ${i}`,
        email: `usuario${i}@test.com`,
        verificado: true,
        rol: 'passenger',
      });
    }

    // Agregar staff
    usuarios.push({
      nombre: 'Staff Demo',
      email: 'staff@test.com',
      verificado: true,
      rol: 'staff',
    });

    usuarios.push({
      nombre: 'Admin Demo',
      email: 'admin@test.com',
      verificado: true,
      rol: 'admin',
    });

    const usersCreated = await User.insertMany(usuarios);
    logger.info(`✅ ${usersCreated.length} usuarios creados`);

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

    // Crear algunos tickets de ejemplo (sin inscribir)
    const passengerUsers = usersCreated.filter((u) => u.rol === 'passenger');
    const tickets = [];

    // Ticket individual
    tickets.push({
      userId: passengerUsers[0]._id,
      codigo_ticket: 'TIX000001',
      pasajeros: [
        {
          nombre: 'Juan Pérez',
          rut: '12345678-9',
        },
      ],
      cantidad_pasajeros: 1,
      estado: 'pendiente',
    });

    // Ticket pareja
    tickets.push({
      userId: passengerUsers[1]._id,
      codigo_ticket: 'TIX000002',
      pasajeros: [
        {
          nombre: 'María González',
          rut: '98765432-1',
        },
        {
          nombre: 'Pedro González',
          rut: '11223344-5',
        },
      ],
      cantidad_pasajeros: 2,
      estado: 'pendiente',
    });

    // Ticket triple
    tickets.push({
      userId: passengerUsers[2]._id,
      codigo_ticket: 'TIX000003',
      pasajeros: [
        {
          nombre: 'Ana López',
          rut: '55667788-9',
        },
        {
          nombre: 'Carlos López',
          rut: '99887766-5',
        },
        {
          nombre: 'Sofía López',
          rut: '44332211-0',
        },
      ],
      cantidad_pasajeros: 3,
      estado: 'pendiente',
    });

    await Ticket.insertMany(tickets);
    logger.info(`✅ ${tickets.length} tickets creados (1 individual, 1 pareja, 1 triple)`);

    logger.info('\n📋 RESUMEN:');
    logger.info(`   - ${usersCreated.length} usuarios (10 pasajeros + 2 staff)`);
    logger.info(`   - 2 Cessna 172 (CC-PAT y CC-SKE, capacidad 3 c/u)`);
    logger.info(`   - ${flightsCreated.length} tandas programadas`);
    logger.info(`   - ${tickets.length} tickets de ejemplo`);
    logger.info('\n🔐 CREDENCIALES DE PRUEBA:');
    logger.info('   Pasajero: usuario1@test.com (ticket individual)');
    logger.info('   Pasajero: usuario2@test.com (ticket pareja)');
    logger.info('   Pasajero: usuario3@test.com (ticket triple)');
    logger.info('   Staff: staff@test.com');
    logger.info('   Admin: admin@test.com');
    logger.info('\n💡 Los pasajeros deben inscribirse en una tanda disponible\n');

    process.exit(0);
  } catch (error) {
    console.error('Error en seed:', error);
    logger.error('Error en seed:', error);
    process.exit(1);
  }
};

seed();
