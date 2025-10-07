const mongoose = require('mongoose');
require('dotenv').config();

const clearDatabase = async () => {
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
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

clearDatabase();
