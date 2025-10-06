import mongoose from 'mongoose';
import { Payment, User } from '../models';
import dotenv from 'dotenv';

dotenv.config();

const checkPayments = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Conectado a MongoDB');

    const payments = await Payment.find().populate('userId', 'nombre apellido email');
    console.log(`Total de pagos: ${payments.length}`);

    if (payments.length > 0) {
      console.log('\n--- Primeros 5 pagos ---');
      payments.slice(0, 5).forEach((p) => {
        const user = p.userId as any;
        console.log({
          monto: p.monto,
          tipo: p.tipo,
          usuario: user ? `${user.nombre} ${user.apellido}` : 'Usuario eliminado',
          fecha: p.fecha,
          metodo_pago: p.metodo_pago,
        });
      });
    } else {
      console.log('No hay pagos registrados en la base de datos');
    }

    const users = await User.find({ rol: 'passenger' });
    console.log(`\nTotal de pasajeros: ${users.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkPayments();
