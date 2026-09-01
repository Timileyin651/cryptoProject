import express from 'express';
import path from 'path';
import expressLayouts from 'express-ejs-layouts';
import { config } from './config';
import { logger } from './utils/logger';
import {
  errorHandler,
  securityMiddleware,
  requestLogger,
  requestId,
  notFound,
} from './middleware';
import routes from './routes';
import { authController } from './controllers/AuthController';

const app = express();

// Trust proxy (for rate limiter behind reverse proxy)
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(requestId);
app.use(requestLogger);
securityMiddleware(app);

// Health check before API routes (for load balancers)
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Auth view routes (EJS pages)
app.get('/auth/register', authController.renderRegister);
app.post('/auth/register', authController.webRegister);
app.get('/auth/login', authController.renderLogin);
app.post('/auth/login', authController.webLogin);
app.get('/auth/forgot-password', authController.renderForgotPassword);
app.post('/auth/forgot-password', authController.webForgotPassword);
app.get('/auth/reset-password', authController.renderResetPassword);
app.post('/auth/reset-password', authController.webResetPassword);

// View routes (EJS pages)
app.get('/', (_req, res) => {
  res.render('index', { title: 'Crypto Arbitrage Scanner' });
});

// API routes
app.use(config.apiPrefix, routes);

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

export { app };
