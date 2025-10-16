import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Settings } from '../models';
import { logger } from '../utils/logger';

const MONGODB_URI = process.env.MONGODB_URI || '';

async function initStaff() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(MONGODB_URI);
    logger.info('✅ Conectado a MongoDB');

    // Verificar si el usuario staff ya existe
    const existingStaff = await User.findOne({ email: 'staff@cac.cl' });

    if (existingStaff) {
      logger.info('⚠️  Usuario staff ya existe');
      process.exit(0);
    }

    // Crear contraseña hasheada
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Crear usuario staff
    const staff = await User.create({
      email: 'staff@cac.cl',
      password: hashedPassword,
      nombre: 'Staff',
      apellido: 'Club Aéreo',
      rut: '00000000-0',
      rol: 'staff',
      verificado: true,
    });

    logger.info('✅ Usuario staff creado exitosamente');
    logger.info(`   Email: staff@cac.cl`);
    logger.info(`   Contraseña: admin123`);

    // Verificar/crear Settings con contraseña admin
    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({
        duracion_circuito_minutos: 20,
        max_circuitos_sin_reabastecimiento_default: 4,
        precio_ticket: 25000,
        timezone_offset_hours: 3,
        minutos_antes_embarque: 15,
        admin_password: 'admin123', // Se hasheará por el pre-save hook
      });
      logger.info('✅ Settings creado con contraseña admin');
    } else {
      // Si settings existe pero no tiene admin_password, agregarlo
      if (!settings.admin_password || settings.admin_password === '') {
        settings.admin_password = 'admin123';
        await settings.save();
        logger.info('✅ Contraseña admin agregada a Settings');
      }
    }

    logger.info('✅ Inicialización completada');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error en inicialización:', error);
    process.exit(1);
  }
}

// Ejecutar script
initStaff();
