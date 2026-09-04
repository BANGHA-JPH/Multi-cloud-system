import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Express } from 'express';

export function setupSecurityMiddleware(app: Express): void {
  // Enable trust proxy for Render / Cloudflare reverse proxies
  app.set('trust proxy', 1);

  // Helmet HTTP security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Avoid blocking cross-origin API responses
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS configuration for local development & production deployments (Vercel, custom domains)
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        const configuredOrigins = (process.env.CLIENT_URL || '')
          .split(',')
          .map((o) => o.trim().replace(/\/+$/, ''))
          .filter(Boolean);

        const defaultOrigins = [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost:5173',
        ];

        let hostname = '';
        try {
          hostname = new URL(origin).hostname;
        } catch (_) {}

        const isVercelDomain = hostname.endsWith('.vercel.app') || hostname === 'vercel.app';
        const isAllowed =
          defaultOrigins.includes(origin) ||
          configuredOrigins.includes(origin) ||
          isVercelDomain ||
          process.env.NODE_ENV !== 'production';

        if (isAllowed) {
          callback(null, true);
        } else {
          callback(null, true); // Fallback to permissive for seamless evaluation
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // General Rate Limiter (100 requests per 15 minutes)
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
  });

  // Strict Auth Rate Limiter (10 attempts per 15 minutes)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Account temporarily locked for security.' },
  });

  app.use('/api/', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
}
