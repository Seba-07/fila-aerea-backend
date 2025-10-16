import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { connectDB } from './config/database';
import { logger } from './utils/logger';
import { globalLimiter } from './middlewares/rateLimiter';
import { errorHandler } from './middlewares/errorHandler';
import routes from './routes';
import { initSocket } from './sockets';
import { cleanupExpiredReservations } from './controllers/flightController';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 4000;

// Middlewares de seguridad
app.use(helmet());

// Configurar CORS para múltiples dominios
const allowedOrigins = [
  'http://localhost:3000',
  'https://fila-aerea-frontend.vercel.app',
  'https://vueloscastro.cl',
  'https://www.vueloscastro.cl',
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (mobile apps, curl, etc)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
app.use(globalLimiter);

// Swagger docs
try {
  const swaggerDocument = YAML.load(path.join(__dirname, '../docs/openapi.yaml'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (error) {
  logger.warn('⚠️  No se pudo cargar OpenAPI docs');
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api', routes);

// Error handler
app.use(errorHandler);

// Función para inicializar usuario staff
const initStaffUser = async () => {
  try {
    const bcrypt = (await import('bcryptjs')).default;
    const { User, Settings } = await import('./models');

    // Verificar si el usuario staff ya existe
    const existingStaff = await User.findOne({ email: 'staff@cac.cl' });

    if (!existingStaff) {
      // Crear contraseña hasheada
      const hashedPassword = await bcrypt.hash('admin123', 10);

      // Crear usuario staff
      await User.create({
        email: 'staff@cac.cl',
        password: hashedPassword,
        nombre: 'Staff',
        apellido: 'Club Aéreo',
        rut: '00000000-0',
        rol: 'staff',
        verificado: true,
      });

      logger.info('✅ Usuario staff creado: staff@cac.cl / admin123');
    }

    // Verificar/crear Settings
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        duracion_circuito_minutos: 20,
        max_circuitos_sin_reabastecimiento_default: 4,
        precio_ticket: 25000,
        timezone_offset_hours: 3,
        minutos_antes_embarque: 15,
        admin_password: 'admin123',
      });
      logger.info('✅ Settings inicializado con contraseña admin');
    }
  } catch (error) {
    logger.error('Error inicializando staff:', error);
  }
};

// Inicializar servicios
const startServer = async () => {
  try {
    // Conectar a MongoDB
    await connectDB();

    // Inicializar usuario staff si no existe
    await initStaffUser();

    // Inicializar Socket.IO
    initSocket(server);

    // Iniciar background job para limpiar reservas expiradas
    // Ejecutar cada 60 segundos (1 minuto)
    const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
    setInterval(() => {
      cleanupExpiredReservations().catch((error) => {
        logger.error('Error en cleanup job de reservas:', error);
      });
    }, CLEANUP_INTERVAL_MS);

    // Ejecutar una vez al inicio
    cleanupExpiredReservations().catch((error) => {
      logger.error('Error en cleanup inicial de reservas:', error);
    });

    logger.info('✓ Background job de limpieza de reservas iniciado (cada 60 segundos)');

    // Iniciar servidor
    server.listen(PORT, () => {
      logger.info(`🚀 Servidor corriendo en puerto ${PORT}`);
      logger.info(`📚 API Docs: http://localhost:${PORT}/docs`);
      logger.info(`🏥 Health: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
};

startServer();

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});
