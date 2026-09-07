import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

let io: Server;

/**
 * Authenticate a Socket.IO connection via handshake auth token.
 * Tokens are passed in the handshake query or auth object.
 * Unauthenticated connections are rejected.
 */
function authenticateSocket(socket: Socket): boolean {
  try {
    const token =
      socket.handshake.auth?.token || (socket.handshake.query?.token as string | undefined);

    if (!token || typeof token !== 'string') {
      logger.warn(`[WS] Rejected connection — no token provided`, { socketId: socket.id });
      return false;
    }

    // Verify JWT (same secret as the REST API)
    const payload = jwt.verify(token, config.jwt.secret) as { userId: number; email: string };

    // Attach user info to socket for downstream use
    (socket as any).userId = payload.userId;
    (socket as any).userEmail = payload.email;

    return true;
  } catch {
    logger.warn(`[WS] Rejected connection — invalid token`, { socketId: socket.id });
    return false;
  }
}

export const initWebSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: config.cors.allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Reject connections without valid auth
    allowRequest: (req, callback) => {
      // For the initial handshake, we allow the connection through
      // and authenticate on the 'connection' event. This is because
      // socket.io middleware runs before auth data is fully available.
      callback(null, true);
    },
  });

  // Middleware: authenticate every connection
  io.use((socket, next) => {
    if (authenticateSocket(socket)) {
      next();
    } else {
      next(new Error('Authentication required'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId;
    logger.info(`WebSocket client connected: ${socket.id} (user=${userId})`);

    // Join a user-specific room for targeted broadcasts
    socket.join(`user:${userId}`);

    socket.on('disconnect', () => {
      logger.info(`WebSocket client disconnected: ${socket.id} (user=${userId})`);
    });
  });

  logger.info('WebSocket server initialized (auth required)');
  return io;
};

export const getIO = (): Server => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initWebSocket first.');
  }
  return io;
};
