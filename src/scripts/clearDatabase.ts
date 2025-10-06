import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const clearDatabase = async () => {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/fila-aerea';
    await mongoose.connect(mongoUri);

    console.log('✅ Conectado a MongoDB');
    console.log(`📊 Base de datos: ${mongoose.connection.db.databaseName}`);

    // Obtener todas las colecciones
    const collections = await mongoose.connection.db.collections();

    console.log(`\n🗑️  Eliminando datos de ${collections.length} colecciones...\n`);

    // Eliminar todos los documentos de cada colección
    for (const collection of collections) {
      const count = await collection.countDocuments();
      await collection.deleteMany({});
      console.log(`   ✓ ${collection.collectionName}: ${count} documentos eliminados`);
    }

    console.log('\n✨ Base de datos limpiada exitosamente!\n');

    // Cerrar conexión
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al limpiar la base de datos:', error);
    process.exit(1);
  }
};

clearDatabase();
