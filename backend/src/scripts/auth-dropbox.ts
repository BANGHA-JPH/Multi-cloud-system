import dotenv from 'dotenv';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { exchangeDropboxCode, getDropboxAuthUrl, getDropboxStorageUsage } from '../services/storage/dropbox.service';

dotenv.config();

// Configurable Redirect URI
const REDIRECT_URI = process.env.DROPBOX_REDIRECT_URI || 'http://localhost:8080/callback';
const parsedRedirect = new URL(REDIRECT_URI);
const PORT = parseInt(parsedRedirect.port, 10) || 8080;
const CALLBACK_PATH = parsedRedirect.pathname || '/callback';

async function main() {
  console.log('\n======================================================');
  console.log('  📦  CloudFusion Dropbox OAuth & Sync CLI Utility');
  console.log('======================================================\n');

  const appKey = process.env.DROPBOX_APP_KEY || process.env.DROPBOX_CLIENT_ID;
  const appSecret = process.env.DROPBOX_APP_SECRET || process.env.DROPBOX_CLIENT_SECRET;

  if (!appKey || !appSecret) {
    console.error('❌ Missing DROPBOX_APP_KEY or DROPBOX_APP_SECRET in .env file!');
    console.log('\n📋 Quick Setup Guide for Dropbox App:');
    console.log('1. Go to https://www.dropbox.com/developers/apps');
    console.log('2. Click "Create app" -> Choose "Scoped access" -> "Full Dropbox" (or "App folder")');
    console.log('3. In the "Permissions" tab, enable:');
    console.log('   - files.content.write');
    console.log('   - files.content.read');
    console.log('   - files.metadata.read');
    console.log('   - account_info.read');
    console.log(`4. In the "Settings" tab, add redirect URI: ${REDIRECT_URI} and http://localhost:5000/api/storage/dropbox/callback`);
    console.log('5. Add to your backend/.env:');
    console.log('   DROPBOX_APP_KEY=your_app_key');
    console.log('   DROPBOX_APP_SECRET=your_app_secret');
    console.log('   DROPBOX_REDIRECT_URI=' + REDIRECT_URI + '\n');
    process.exit(1);
  }

  console.log(`🔑 App Key: ${appKey}`);
  console.log(`🔒 App Secret: [Configured - ${appSecret.substring(0, 4)}...]`);
  console.log(`📍 Using Redirect URI: ${REDIRECT_URI}\n`);

  // Check if refresh token or access token is already available
  if (process.env.DROPBOX_REFRESH_TOKEN || process.env.DROPBOX_ACCESS_TOKEN) {
    console.log('ℹ️  Existing Dropbox token detected in environment.');
    console.log('🔄 Testing live Dropbox connection and quota...');
    try {
      const usage = await getDropboxStorageUsage();
      if (usage.isConnected) {
        console.log('\n✅ Dropbox Connected Successfully!');
        console.log(`   - Owner: ${usage.userName || 'Unknown'} (${usage.userEmail || 'N/A'})`);
        console.log(`   - Total Storage: ${(Number(usage.totalBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
        console.log(`   - Used Storage:  ${(Number(usage.usedBytes) / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`   - Free Storage:  ${(Number(usage.freeBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB\n`);
      }
    } catch (e) {
      console.warn('⚠️ Token test encountered notice:', e);
    }
  }

  const authUrl = getDropboxAuthUrl(REDIRECT_URI);

  console.log('👉 To link your Dropbox account, open this URL in your browser:');
  console.log(`\n🔗 ${authUrl}\n`);
  console.log(`⏳ Temporary callback listener active on ${REDIRECT_URI} ...`);

  const server = http.createServer(async (req, res) => {
    const fullReqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (
      fullReqUrl.pathname === CALLBACK_PATH ||
      fullReqUrl.pathname === '/callback' ||
      fullReqUrl.pathname === '/api/storage/dropbox/callback'
    ) {
      const code = fullReqUrl.searchParams.get('code');

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization Error</h1><p>No authorization code received from Dropbox.</p>');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: sans-serif; background: #0b0f19; color: #fff; text-align: center; padding: 50px;">
            <h1 style="color: #0061ff;">CloudFusion Dropbox Connected!</h1>
            <p>Authorization tokens received and verified. You can now close this tab and return to your terminal.</p>
          </body>
        </html>
      `);

      console.log('\n📥 Received Authorization Code! Exchanging for tokens...');
      const tokens = await exchangeDropboxCode(code, REDIRECT_URI);

      if (tokens && (tokens.refreshToken || tokens.accessToken)) {
        console.log('✅ Access Token & Refresh Token obtained successfully!');
        if (tokens.refreshToken) {
          console.log(`🔑 Refresh Token: ${tokens.refreshToken.substring(0, 15)}...`);
        }

        // Save to .env file
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');

          if (tokens.refreshToken) {
            if (envContent.includes('DROPBOX_REFRESH_TOKEN=')) {
              envContent = envContent.replace(
                /DROPBOX_REFRESH_TOKEN=.*/g,
                `DROPBOX_REFRESH_TOKEN=${tokens.refreshToken}`
              );
            } else {
              envContent += `\nDROPBOX_REFRESH_TOKEN=${tokens.refreshToken}\n`;
            }
          }

          if (tokens.accessToken) {
            if (envContent.includes('DROPBOX_ACCESS_TOKEN=')) {
              envContent = envContent.replace(
                /DROPBOX_ACCESS_TOKEN=.*/g,
                `DROPBOX_ACCESS_TOKEN=${tokens.accessToken}`
              );
            } else {
              envContent += `\nDROPBOX_ACCESS_TOKEN=${tokens.accessToken}\n`;
            }
          }

          fs.writeFileSync(envPath, envContent, 'utf8');
          console.log('💾 Saved Dropbox tokens to .env file!');
        }

        if (tokens.refreshToken) process.env.DROPBOX_REFRESH_TOKEN = tokens.refreshToken;
        if (tokens.accessToken) process.env.DROPBOX_ACCESS_TOKEN = tokens.accessToken;

        // Test live storage
        console.log('\n📊 Fetching Live Dropbox Quota Metrics...');
        const usage = await getDropboxStorageUsage();
        console.log(`   - Owner: ${usage.userName || 'Unknown'} (${usage.userEmail || 'N/A'})`);
        console.log(`   - Total Storage: ${(Number(usage.totalBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
        console.log(`   - Used Storage:  ${(Number(usage.usedBytes) / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`   - Free Storage:  ${(Number(usage.freeBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);

        console.log('\n🎉 Setup Complete! CloudFusion Multi-Cloud Mesh is linked with Dropbox.\n');
      } else {
        console.error('❌ Failed to retrieve tokens from Dropbox.');
      }

      server.close();
      process.exit(0);
    }
  });

  server.listen(PORT, () => {
    console.log(`[HTTP] Temporary OAuth listener server listening on port ${PORT}...`);
  });
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
