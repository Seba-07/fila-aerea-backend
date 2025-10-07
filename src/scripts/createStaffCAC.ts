import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models';
import dotenv from 'dotenv';

dotenv.config();

const createStaffCAC = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('✅ Conectado a MongoDB');

    // Verificar si ya existe
    const existing = await User.findOne({ email: 'staff@cac.cl' });
    if (existing) {
      console.log('⚠️  El usuario staff@cac.cl ya existe');
      process.exit(0);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('staff123', 10);

    // Crear usuario
    const staffUser = await User.create({
      nombre: 'Staff',
      apellido: 'CAC',
      email: 'staff@cac.cl',
      password: hashedPassword,
      rol: 'staff',
      verificado: true,
    });

    console.log('\n✅ Usuario staff creado exitosamente');
    console.log('📧 Email: staff@cac.cl');
    console.log('🔑 Password: staff123');
    console.log('\n⚠️  IMPORTANTE: Cambia la contraseña después del primer login\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

createStaffCAC();
