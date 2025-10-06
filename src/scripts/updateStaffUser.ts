import mongoose from 'mongoose';
import { User } from '../models';
import dotenv from 'dotenv';

dotenv.config();

const updateStaffUser = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Conectado a MongoDB');

    // Revertir Vitto Loco a passenger
    const vitto = await User.findOne({ email: 'vitto@test.com' });
    if (vitto) {
      vitto.rol = 'passenger';
      await vitto.save();
      console.log('✅ Vitto Loco convertido de vuelta a passenger');
    }

    // Buscar o crear el usuario staff correcto
    let staff = await User.findOne({ email: 'staff@cac.cl' });

    if (staff) {
      // Si existe, actualizar su rol a staff
      staff.rol = 'staff';
      staff.nombre = 'Staff';
      staff.apellido = 'Usuario';
      staff.verificado = true;
      await staff.save();
      console.log('✅ Usuario existente staff@cac.cl actualizado a rol staff');
    } else {
      // Si no existe, crear el usuario staff
      staff = await User.create({
        nombre: 'Staff',
        apellido: 'Usuario',
        email: 'staff@cac.cl',
        verificado: true,
        rol: 'staff',
      });
      console.log('✅ Usuario staff@cac.cl creado con rol staff');
    }

    console.log('\n📋 Usuario Staff Final:');
    console.log({
      nombre: `${staff.nombre} ${staff.apellido}`,
      email: staff.email,
      rol: staff.rol,
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

updateStaffUser();
