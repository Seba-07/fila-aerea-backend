import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { logger } from '../utils/logger';

let io: Server;

export const initSocket = (server: HTTPServer): Server => {
  // Configurar CORS para múltiples dominios (igual que Express)
  const allowedOrigins = [
    'http://localhost:3000',
    'https://fila-aerea-frontend.vercel.app',
    'https://vueloscastro.cl',
    'https://www.vueloscastro.cl',
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
  ].filter(Boolean);

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  // Middleware de autenticación
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Token no proporcionado'));
      }

      const payload = verifyToken(token);
      (socket as any).userId = payload.userId;
      (socket as any).userRol = payload.rol;
      next();
    } catch (error) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    logger.info(`✅ Socket conectado: ${socket.id} (user: ${userId})`);

    // Unirse a room de usuario
    socket.join(`user:${userId}`);

    // Suscribirse a vuelos
    socket.on('subscribeFlight', (flightId: string) => {
      socket.join(`flight:${flightId}`);
      logger.info(`Usuario ${userId} suscrito a flight:${flightId}`);
    });

    socket.on('unsubscribeFlight', (flightId: string) => {
      socket.leave(`flight:${flightId}`);
      logger.info(`Usuario ${userId} desuscrito de flight:${flightId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`❌ Socket desconectado: ${socket.id}`);
    });
  });

  logger.info('✅ Socket.IO inicializado');

  return io;
};

export const getIO = (): Server => {
  if (!io) {
    throw new Error('Socket.IO no inicializado');
  }
  return io;
};
