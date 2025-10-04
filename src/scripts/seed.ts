import 'dotenv/config';
import mongoose from 'mongoose';
import { User, Aircraft, Flight, Seat, Ticket } from '../models';
import { logger } from '../utils/logger';

const seed = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI no definida');
    }

    await mongoose.connect(mongoUri);
    logger.info('✅ Conectado a MongoDB');

    // Limpiar datos existentes
    await Promise.all([
      User.deleteMany({}),
      Aircraft.deleteMany({}),
      Flight.deleteMany({}),
      Seat.deleteMany({}),
      Ticket.deleteMany({}),
    ]);

    logger.info('🗑️  Datos anteriores eliminados');

    // Crear usuarios
    const usuarios = [];
    for (let i = 1; i <= 20; i++) {
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

    // Crear tickets (solo para pasajeros)
    const tickets = [];
    const passengerUsers = usersCreated.filter((u) => u.rol === 'passenger');

    for (let i = 0; i < passengerUsers.length; i++) {
      tickets.push({
        userId: passengerUsers[i]._id,
        codigo_ticket: `TIX${String(i + 1).padStart(6, '0')}`,
        turno_global: i + 1,
        estado: 'activo',
      });
    }

    await Ticket.insertMany(tickets);
    logger.info(`✅ ${tickets.length} tickets creados`);

    // Crear aviones
    const aircraft1 = await Aircraft.create({
      alias: 'Cessna-X',
      seats: 4,
      layout: { rows: 2, cols: 2 },
    });

    const aircraft2 = await Aircraft.create({
      alias: 'Twin-Y',
      seats: 8,
      layout: { rows: 4, cols: 2 },
    });

    logger.info('✅ 2 aviones creados');

    // Crear vuelos
    const now = new Date();

    const vuelo1 = await Flight.create({
      aircraftId: aircraft1._id,
      fechaHoraProg: new Date(now.getTime() + 2 * 60 * 60 * 1000), // +2h
      estado: 'abierto',
      zona: 'A',
      puerta: 'A1',
      turno_max_permitido: 12, // Permite a los primeros 12
    });

    const vuelo2 = await Flight.create({
      aircraftId: aircraft2._id,
      fechaHoraProg: new Date(now.getTime() + 3 * 60 * 60 * 1000), // +3h
      estado: 'boarding',
      zona: 'B',
      puerta: 'B2',
      turno_max_permitido: 8,
    });

    const vuelo3 = await Flight.create({
      aircraftId: aircraft1._id,
      fechaHoraProg: new Date(now.getTime() + 5 * 60 * 60 * 1000), // +5h
      estado: 'draft',
      zona: 'A',
      turno_max_permitido: 0,
    });

    logger.info('✅ 3 vuelos creados');

    // Crear asientos para cada vuelo
    const createSeats = async (flight: any, totalSeats: number) => {
      const seats = [];
      const rows = Math.ceil(totalSeats / 2);

      for (let row = 1; row <= rows; row++) {
        seats.push({
          flightId: flight._id,
          seatNumber: `A${row}`,
          status: 'libre',
        });

        if (seats.length < totalSeats) {
          seats.push({
            flightId: flight._id,
            seatNumber: `B${row}`,
            status: 'libre',
          });
        }
      }

      await Seat.insertMany(seats.slice(0, totalSeats));
    };

    await createSeats(vuelo1, 4);
    await createSeats(vuelo2, 8);
    await createSeats(vuelo3, 4);

    logger.info('✅ Asientos creados para todos los vuelos');

    logger.info('\n📋 RESUMEN:');
    logger.info(`   - ${usersCreated.length} usuarios (20 pasajeros + 2 staff)`);
    logger.info(`   - ${tickets.length} tickets (turnos 1-${tickets.length})`);
    logger.info(`   - 2 aviones (Cessna-X: 4 asientos, Twin-Y: 8 asientos)`);
    logger.info(`   - 3 vuelos (1 abierto, 1 boarding, 1 draft)`);
    logger.info(`   - Vuelo 1: abierto, turno_max_permitido=12`);
    logger.info(`   - Vuelo 2: boarding, turno_max_permitido=8`);
    logger.info(`   - Vuelo 3: draft, turno_max_permitido=0`);
    logger.info('\n🔐 CREDENCIALES DE PRUEBA:');
    logger.info('   Pasajero: usuario1@test.com (turno 1)');
    logger.info('   Pasajero: usuario5@test.com (turno 5)');
    logger.info('   Staff: staff@test.com');
    logger.info('   Admin: admin@test.com');
    logger.info('\n💡 Usa POST /api/auth/request-otp con estos emails');
    logger.info('   El código OTP aparecerá en los logs del servidor\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error en seed:', error);
    process.exit(1);
  }
};

seed();
