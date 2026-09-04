import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { setupSecurityMiddleware } from './middleware/security.middleware';
import authRoutes from './routes/auth.routes';
import fileRoutes from './routes/file.routes';
import storageRoutes from './routes/storage.routes';
import adminRoutes from './routes/admin.routes';

dotenv.config();

const app = express();

// Security Middleware (Helmet, CORS, Rate Limiting)
setupSecurityMiddleware(app);

// Custom Cookie Parsing Middleware
app.use((req: Request, _res: Response, next) => {
  const cookieHeader = req.headers.cookie;
  (req as any).cookies = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      if (parts.length === 2) {
        (req as any).cookies[parts[0].trim()] = decodeURIComponent(parts[1].trim());
      }
    });
  }
  next();
});

// JSON & Body Parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check Endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    system: 'CloudFusion Multi-Cloud Storage Engine',
    security: {
      encryption: 'AES-256-GCM Enabled',
      hashing: 'SHA-256 Verified',
      headers: 'Helmet Secured',
    },
    cloudProviders: ['AWS S3', 'Google Drive', 'Dropbox', 'MEGA', 'OneDrive'],
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/admin', adminRoutes);

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

export default app;
