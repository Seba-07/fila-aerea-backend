const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const resetDatabase = async () => {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);

    console.log('✅ Conectado a MongoDB');
    console.log('🗑️  Eliminando todas las colecciones...');

    const collections = await mongoose.connection.db.collections();

    for (let collection of collections) {
      await collection.drop();
      console.log(`   ✓ Colección "${collection.collectionName}" eliminada`);
    }

    console.log('✅ Base de datos limpiada exitosamente');
    console.log('');
    console.log('👤 Creando usuario administrador...');

    // Importar modelos
    const User = mongoose.model('User', new mongoose.Schema({
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      nombre: { type: String, required: true },
      apellido: { type: String },
      rut: { type: String },
      rol: { type: String, enum: ['passenger', 'staff'], default: 'passenger' },
    }, { timestamps: true }));

    const Settings = mongoose.model('Settings', new mongoose.Schema({
      duracion_tanda_minutos: { type: Number, default: 20 },
      max_tandas_sin_reabastecimiento_default: { type: Number, default: 4 },
      precio_ticket: { type: Number, default: 15000 },
      hora_inicio_primera_tanda: { type: Date },
    }, { timestamps: true }));

    // Crear usuario administrador
    const hashedPassword = await bcrypt.hash('admin123', 10);

    const adminUser = await User.create({
      email: 'staff@cac.cl',
      password: hashedPassword,
      nombre: 'Staff',
      apellido: 'CAC',
      rut: '11111111-1',
      rol: 'staff',
    });

    console.log(`   ✓ Usuario administrador creado: ${adminUser.email}`);
    console.log(`   ✓ Contraseña: admin123`);
    console.log(`   ✓ Rol: ${adminUser.rol}`);
    console.log('');

    // Crear configuración por defecto
    const settings = await Settings.create({
      duracion_tanda_minutos: 20,
      max_tandas_sin_reabastecimiento_default: 4,
      precio_ticket: 15000,
    });

    console.log('⚙️  Configuración inicial creada:');
    console.log(`   ✓ Duración tanda: ${settings.duracion_tanda_minutos} minutos`);
    console.log(`   ✓ Max tandas sin reabastecimiento: ${settings.max_tandas_sin_reabastecimiento_default}`);
    console.log(`   ✓ Precio ticket: $${settings.precio_ticket.toLocaleString('es-CL')} CLP`);
    console.log('');

    console.log('✅ Base de datos reseteada con usuario administrador');
    console.log('');
    console.log('📋 Credenciales de acceso:');
    console.log('   Email: staff@cac.cl');
    console.log('   Contraseña: admin123');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

resetDatabase();
