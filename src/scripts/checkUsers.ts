import mongoose from 'mongoose';
import { User } from '../models';
import dotenv from 'dotenv';

dotenv.config();

const checkUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Conectado a MongoDB');

    const users = await User.find();
    console.log(`\nTotal de usuarios: ${users.length}\n`);

    console.log('=== USUARIOS ===');
    users.forEach(u => {
      console.log({
        id: u._id,
        nombre: u.nombre,
        apellido: u.apellido,
        email: u.email,
        rol: u.rol,
      });
    });

    // Contar por rol
    const byRol: any = {};
    users.forEach(u => {
      if (!byRol[u.rol]) byRol[u.rol] = 0;
      byRol[u.rol]++;
    });

    console.log('\n=== USUARIOS POR ROL ===');
    Object.keys(byRol).forEach(rol => {
      console.log(`${rol}: ${byRol[rol]}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkUsers();
