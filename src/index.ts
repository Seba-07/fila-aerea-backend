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
import { initializeMercadoPago } from './config/mercadopago';
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
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
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

// Inicializar servicios
const startServer = async () => {
  try {
    // Conectar a MongoDB
    await connectDB();

    // Inicializar Mercado Pago
    initializeMercadoPago();

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
