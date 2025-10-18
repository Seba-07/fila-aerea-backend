# Reset Database - Mantener Solo Admin Staff

Si tienes problemas de conectividad ejecutando el script desde la terminal, puedes usar MongoDB Compass o la consola web de MongoDB Atlas.

## Método 1: MongoDB Compass

1. Conecta a tu base de datos usando MongoDB Compass con esta URI:
   ```
   mongodb+srv://filaaerea_admin:S1e1b2a3@fila-aerea-cluster.luxggr1.mongodb.net/fila-aerea
   ```

2. Abre la shell de Compass (icono `>_MONGOSH` en la parte inferior)

3. Pega y ejecuta este código:

```javascript
// Verificar que existe el admin staff
const admin = db.users.findOne({email: 'staff@vueloscastro.cl', rol: 'staff'});
if (!admin) {
  print('❌ ERROR: No se encontró el usuario admin staff');
} else {
  print('✓ Usuario admin encontrado: ' + admin.email);

  // Guardar el ID del admin
  const adminId = admin._id;

  // Eliminar todos los usuarios excepto el admin
  const usersDeleted = db.users.deleteMany({_id: {$ne: adminId}});
  print('✓ Usuarios eliminados: ' + usersDeleted.deletedCount);

  // Eliminar todas las demás colecciones
  print('\n🗑️  Eliminando datos...\n');

  print('✓ Verificaciones: ' + db.verifications.deleteMany({}).deletedCount);
  print('✓ Tickets: ' + db.tickets.deleteMany({}).deletedCount);
  print('✓ Aviones: ' + db.aircrafts.deleteMany({}).deletedCount);
  print('✓ Vuelos: ' + db.flights.deleteMany({}).deletedCount);
  print('✓ Manifiestos: ' + db.flightmanifests.deleteMany({}).deletedCount);
  print('✓ Notificaciones: ' + db.notifications.deleteMany({}).deletedCount);
  print('✓ Logs: ' + db.eventlogs.deleteMany({}).deletedCount);
  print('✓ Pagos: ' + db.payments.deleteMany({}).deletedCount);
  print('✓ Reabastecimientos: ' + db.refuelings.deleteMany({}).deletedCount);
  print('✓ Push subscriptions: ' + db.pushsubscriptions.deleteMany({}).deletedCount);
  print('✓ Transacciones: ' + db.transactions.deleteMany({}).deletedCount);
  print('✓ Reservas: ' + db.reservations.deleteMany({}).deletedCount);
  print('✓ Pilotos: ' + db.pilots.deleteMany({}).deletedCount);

  print('\n✅ Base de datos limpiada exitosamente');
  print('👤 Usuario admin mantenido: ' + admin.email);
}
```

## Método 2: MongoDB Atlas Web Console

1. Ingresa a https://cloud.mongodb.com
2. Ve a tu cluster "fila-aerea-cluster"
3. Click en "Collections"
4. Para cada colección (excepto `users` y `settings`):
   - Click en la colección
   - Click en "..." (tres puntos)
   - Click en "Delete all documents"

5. Para la colección `users`:
   - Click en "users"
   - Selecciona todos EXCEPTO el documento con `email: "staff@vueloscastro.cl"`
   - Click en "Delete" para cada documento

## Método 3: Desde Railway (Si tienes Railway CLI)

```bash
railway run node scripts/quickReset.js
```

## Verificación

Después de limpiar, verifica que solo quede:
- 1 usuario: staff@vueloscastro.cl
- 1 documento en settings (configuración del sistema)
- Todas las demás colecciones en 0 documentos

## Troubleshooting

Si el script falla con error de DNS/timeout, es probable que:
1. Tu red/firewall esté bloqueando la conexión a MongoDB Atlas
2. MongoDB Atlas requiera que agregues tu IP a la whitelist
3. Las credenciales hayan cambiado

Para verificar conectividad:
```bash
ping fila-aerea-cluster.luxggr1.mongodb.net
```
