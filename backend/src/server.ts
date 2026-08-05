import app from './app';
import { connectDB } from './config/db';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  console.log('🚀 Starting CloudFusion Multi-Cloud Backend System...');
  
  // Connect to Database
  await connectDB();

  app.listen(PORT, () => {
    console.log(`⚡ CloudFusion Server is running on port ${PORT}`);
    console.log(`🔒 AES-256 E2E Encryption Engine: ACTIVE`);
    console.log(`🌐 Health check available at: http://localhost:${PORT}/api/health`);
  });
}

bootstrap().catch((error) => {
  console.error('Fatal Server Boot Error:', error);
  process.exit(1);
});
