import mongoose from 'mongoose';
import { User } from '../models';
import dotenv from 'dotenv';

dotenv.config();

const migrateUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Conectado a MongoDB');

    // Buscar usuarios sin apellido
    const usersWithoutApellido = await User.find({
      $or: [{ apellido: { $exists: false } }, { apellido: null }, { apellido: '' }],
    });

    console.log(`Encontrados ${usersWithoutApellido.length} usuarios sin apellido`);

    // Actualizar cada usuario
    for (const user of usersWithoutApellido) {
      // Si el nombre tiene espacios, dividir en nombre y apellido
      const nombreParts = user.nombre.trim().split(' ');

      if (nombreParts.length > 1) {
        const apellido = nombreParts.pop() || 'Sin Apellido';
        const nombre = nombreParts.join(' ');
        user.nombre = nombre;
        user.apellido = apellido;
      } else {
        // Si no hay espacios, usar "Sin Apellido" como apellido
        user.apellido = 'Sin Apellido';
      }

      await user.save();
      console.log(`✓ Actualizado usuario: ${user.nombre} ${user.apellido} (${user.email})`);
    }

    console.log('Migración completada exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('Error en migración:', error);
    process.exit(1);
  }
};

migrateUsers();
