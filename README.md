# Fila Aérea - Backend

Backend API para gestión de filas y embarques en festival aéreo con vuelos cortos.

## Stack Tecnológico

- **Runtime**: Node.js 18+
- **Framework**: Express + TypeScript
- **Base de datos**: MongoDB Atlas (Mongoose ODM)
- **Tiempo real**: Socket.IO
- **Autenticación**: JWT + OTP por email
- **Seguridad**: Helmet + CORS + express-rate-limit
- **Logging**: Pino
- **Jobs**: node-cron
- **Tests**: Jest + Supertest
- **Docs**: OpenAPI 3.0 + Swagger UI

## Requisitos Previos

- Node.js 18+ y npm
- MongoDB Atlas (cuenta gratuita)
- Cuenta SMTP (Gmail, SendGrid, etc.) - opcional para desarrollo

## Instalación

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/fila-aerea-backend.git
cd fila-aerea-backend

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales
```

## Variables de Entorno

Crear archivo `.env` basado en `.env.example`:

```bash
# Server
PORT=4000
NODE_ENV=development
APP_BASE_URL=http://localhost:4000

# Database - Obtener de MongoDB Atlas
MONGO_URI=mongodb+srv://usuario:password@cluster.mongodb.net/fila-aerea

# JWT - Generar secreto seguro
JWT_SECRET=tu_secreto_super_seguro_cambiar_en_produccion
JWT_EXPIRES_IN=7d

# CORS - URL del frontend
CORS_ORIGIN=http://localhost:3000

# Push Notifications
PUSH_PROVIDER=none  # onesignal | fcm | none
ONESIGNAL_APP_ID=
ONESIGNAL_API_KEY=
FCM_SERVER_KEY=

# Email SMTP (opcional en dev, se simula en logs)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_email@gmail.com
SMTP_PASS=tu_app_password
SMTP_FROM=Fila Aérea <noreply@filaaerea.com>
```

## Configuración de MongoDB Atlas

1. Ir a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Crear cuenta gratuita (M0 Sandbox)
3. Crear nuevo cluster
4. En "Database Access": crear usuario con password
5. En "Network Access": agregar IP `0.0.0.0/0` (permite desde cualquier IP)
6. Conectar → Drivers → Copiar connection string
7. Reemplazar `<password>` y `<dbname>` en `.env`

```
MONGO_URI=mongodb+srv://usuario:PASSWORD@cluster0.xxxxx.mongodb.net/fila-aerea?retryWrites=true&w=majority
```

## Comandos

```bash
# Desarrollo con hot-reload
npm run dev

# Poblar base de datos con datos de ejemplo
npm run seed

# Ejecutar tests
npm test

# Lint y formato
npm run lint
npm run format

# Build para producción
npm run build

# Iniciar en producción
npm start
```

## Poblar Base de Datos (Seed)

```bash
npm run seed
```

Esto crea:
- 20 usuarios pasajeros (usuario1@test.com ... usuario20@test.com)
- 20 tickets con turnos 1-20
- 2 usuarios staff (staff@test.com, admin@test.com)
- 2 aviones (Cessna-X: 4 asientos, Twin-Y: 8 asientos)
- 3 vuelos: 1 abierto, 1 boarding, 1 draft

**Credenciales de prueba**:
- Pasajero: `usuario1@test.com` (turno 1)
- Staff: `staff@test.com`
- Admin: `admin@test.com`

El código OTP aparecerá en los logs del servidor al solicitar login.

## API Endpoints

**Documentación interactiva**: http://localhost:4000/docs

### Autenticación

- `POST /api/auth/request-otp` - Solicitar código OTP
- `POST /api/auth/verify-otp` - Verificar OTP y obtener JWT
- `POST /api/auth/logout` - Cerrar sesión

### Usuario

- `GET /api/me` - Perfil y ticket del usuario

### Vuelos (Pasajeros)

- `GET /api/flights` - Listar vuelos abiertos/boarding
- `GET /api/flights/:id` - Detalle de vuelo con mapa de asientos

### Asientos (Pasajeros)

- `POST /api/flights/:id/seats/hold` - Reservar asiento (5 min)
- `POST /api/flights/:id/seats/confirm` - Confirmar asiento

### Pases de Embarque

- `GET /api/boarding_pass/:id` - Obtener pase con QR

### Staff

- `POST /api/flights` - Crear vuelo
- `PATCH /api/flights/:id` - Actualizar vuelo (estado, turno_max_permitido, etc.)
- `POST /api/flights/:id/close` - Cerrar vuelo y procesar no-shows
- `POST /api/boarding_pass/scan` - Escanear QR y marcar embarcado
- `POST /api/flights/:id/no_show` - Marcar asiento como no-show

## Flujo de Trabajo

### Para Pasajeros

1. Login con OTP: `POST /auth/request-otp` → revisar código en logs → `POST /auth/verify-otp`
2. Ver perfil: `GET /me` (obtener turno_global)
3. Listar vuelos: `GET /flights` (ver turno_max_permitido)
4. Ver asientos: `GET /flights/:id`
5. Reservar: `POST /flights/:id/seats/hold` (hold 5 min)
6. Confirmar: `POST /flights/:id/seats/confirm` (obtiene QR)
7. Mostrar QR: `GET /boarding_pass/:id`

### Para Staff

1. Login con OTP usando `staff@test.com`
2. Crear vuelo: `POST /flights`
3. Abrir vuelo: `PATCH /flights/:id` → `{ "estado": "abierto" }`
4. Incrementar turno: `PATCH /flights/:id` → `{ "turno_max_permitido": 15 }`
5. Boarding: `PATCH /flights/:id` → `{ "estado": "boarding" }`
6. Escanear QR: `POST /boarding_pass/scan` → `{ "qr_token": "..." }`
7. Cerrar vuelo: `POST /flights/:id/close`

## Tiempo Real (Socket.IO)

Eventos emitidos:

- `flightUpdated` - Cambios en vuelo (estado, zona, etc.)
- `seatUpdated` - Cambios en asiento (libre → hold → confirmado → embarcado)

El frontend debe conectarse con token JWT:

```typescript
const socket = io('http://localhost:4000', {
  auth: { token: 'JWT_TOKEN' }
});

socket.emit('subscribeFlight', 'FLIGHT_ID');
socket.on('seatUpdated', (data) => { /* actualizar UI */ });
```

## Jobs Automáticos

- **Liberar holds expirados**: cada 30s, asientos en `hold` con `hold_expires_at` vencido vuelven a `libre`

## Despliegue en Railway

1. Crear cuenta en [Railway](https://railway.app)
2. Nuevo proyecto → Deploy from GitHub
3. Seleccionar repo `fila-aerea-backend`
4. Configurar variables de entorno (copiar de `.env`)
5. Railway asigna URL automáticamente: `https://tu-proyecto.railway.app`
6. Actualizar `CORS_ORIGIN` con URL del frontend en Vercel

**Variables críticas en Railway**:
```
MONGO_URI=mongodb+srv://...
JWT_SECRET=secreto_seguro_produccion
CORS_ORIGIN=https://tu-frontend.vercel.app
NODE_ENV=production
PUSH_PROVIDER=onesignal
```

## Configurar OneSignal (Push Notifications)

1. Crear cuenta en [OneSignal](https://onesignal.com)
2. New App → Web Push
3. Configurar dominio del frontend
4. Copiar App ID y API Key
5. En backend `.env`:
   ```
   PUSH_PROVIDER=onesignal
   ONESIGNAL_APP_ID=tu_app_id
   ONESIGNAL_API_KEY=tu_api_key
   ```
6. En frontend usar SDK de OneSignal (ver README frontend)

## Tests

```bash
npm test
```

Tests incluidos:
- Auth: solicitud y verificación de OTP
- Seats: hold, confirm, validación de turno
- Boarding: escaneo de QR
- No-shows: cooldown automático

## Arquitectura

```
src/
├── config/          # Configuración DB
├── models/          # Esquemas Mongoose
├── controllers/     # Lógica de negocio
├── routes/          # Rutas Express
├── middlewares/     # Auth, rate limit, errors
├── services/        # Email, push, externos
├── sockets/         # Socket.IO
├── jobs/            # Cron jobs
├── utils/           # JWT, logger
├── scripts/         # Seed
└── index.ts         # Entry point
```

## Seguridad

- **CORS** restringido al dominio del frontend
- **Helmet** para headers HTTP seguros
- **Rate limiting** global y por endpoint crítico
- **JWT** con expiración y httpOnly cookies
- **OTP** con expiración 10 min y TTL index
- **RBAC** con roles: passenger, staff, admin
- **Validación** de inputs con express-validator
- **Logs** estructurados de eventos críticos en `events_log`

## Soporte

- Issues: https://github.com/tu-usuario/fila-aerea-backend/issues
- Docs OpenAPI: http://localhost:4000/docs
- Health check: http://localhost:4000/health

## Licencia

MIT
