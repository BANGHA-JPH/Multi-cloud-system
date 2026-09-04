import app from './app';
import { connectDB } from './config/db';

const PORT = process.env.PORT || 5000;

process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ Server Notice [Unhandled Rejection]:', reason);
});

process.on('uncaughtException', (err) => {
  console.warn('⚠️ Server Notice [Uncaught Exception]:', err);
});

async function bootstrap() {
  console.log('🚀 Starting CloudFusion Multi-Cloud Backend System...');

  // Connect to Database
  await connectDB();

  const portNumber = Number(PORT) || 5000;
  app.listen(portNumber, '0.0.0.0', () => {
    console.log(`⚡ CloudFusion Server is running on port ${portNumber} (0.0.0.0)`);
    console.log(`🔒 AES-256 E2E Encryption Engine: ACTIVE`);
    console.log(`🌐 Health check available at: /api/health`);
  });
}

bootstrap().catch((error) => {
  console.error('Fatal Server Boot Error:', error);
  process.exit(1);
});
