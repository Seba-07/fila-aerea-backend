import mongoose from 'mongoose';
import { User } from '../models';
import dotenv from 'dotenv';

dotenv.config();

const createStaffUser = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Conectado a MongoDB');

    // Verificar si ya existe un usuario staff
    const existingStaff = await User.findOne({ rol: 'staff' });
    if (existingStaff) {
      console.log('\n✅ Ya existe un usuario staff:');
      console.log({
        nombre: `${existingStaff.nombre} ${existingStaff.apellido}`,
        email: existingStaff.email,
      });
      process.exit(0);
      return;
    }

    // Preguntar si desea convertir un usuario existente o crear uno nuevo
    const users = await User.find({ rol: 'passenger' });

    if (users.length > 0) {
      console.log('\n=== OPCIONES ===');
      console.log('Puedes convertir un usuario existente a staff:');
      users.forEach((u, index) => {
        console.log(`${index + 1}. ${u.nombre} ${u.apellido} (${u.email})`);
      });
      console.log('\nPara convertir el primer usuario a staff, descomenta la línea correspondiente en el script.');

      // Convertir el primer usuario a staff (descomenta esta línea para ejecutar)
      const userToConvert = users[0];
      userToConvert.rol = 'staff';
      await userToConvert.save();

      console.log(`\n✅ Usuario ${userToConvert.nombre} ${userToConvert.apellido} (${userToConvert.email}) convertido a STAFF`);
    } else {
      // Crear un nuevo usuario staff
      const newStaff = await User.create({
        nombre: 'Staff',
        apellido: 'Usuario',
        email: 'staff@test.com',
        verificado: true,
        rol: 'staff',
      });

      console.log('\n✅ Usuario staff creado:');
      console.log({
        nombre: `${newStaff.nombre} ${newStaff.apellido}`,
        email: newStaff.email,
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

createStaffUser();
