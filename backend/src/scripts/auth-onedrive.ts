import dotenv from 'dotenv';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { exchangeOneDriveCode, getOneDriveAuthUrl, getOneDriveStorageUsage } from '../services/storage/onedrive.service';

dotenv.config();

// Choose Redirect URI: check process.env or fallback
const REDIRECT_URI = process.env.ONEDRIVE_REDIRECT_URI || 'http://localhost:8080/callback';
const parsedRedirect = new URL(REDIRECT_URI);
const PORT = parseInt(parsedRedirect.port, 10) || 8080;
const CALLBACK_PATH = parsedRedirect.pathname || '/callback';

async function main() {
  console.log('\n======================================================');
  console.log('  ðŸŒ  CloudFusion Microsoft OneDrive Auth CLI Utility');
  console.log('======================================================\n');

  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('âŒ Missing ONEDRIVE_CLIENT_ID or ONEDRIVE_CLIENT_SECRET in .env file!');
    process.exit(1);
  }

  console.log(`ðŸ”‘ Client ID: ${clientId}`);
  console.log(`ðŸ”’ Client Secret: [Configured - ${clientSecret.substring(0, 4)}...]`);
  console.log(`ðŸ“ Using Redirect URI: ${REDIRECT_URI}\n`);

  // Check if refresh token already exists
  if (process.env.ONEDRIVE_REFRESH_TOKEN) {
    console.log('â„¹ï¸ Existing ONEDRIVE_REFRESH_TOKEN detected in environment.');
    console.log('ðŸ”„ Testing live Microsoft OneDrive connection and quota...');
    try {
      const usage = await getOneDriveStorageUsage();
      console.log('\nâœ… OneDrive Connected Successfully!');
      console.log(`   - Owner: ${usage.userName || 'Unknown'} (${usage.userEmail || 'N/A'})`);
      console.log(`   - Total Storage: ${(Number(usage.totalBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
      console.log(`   - Used Storage:  ${(Number(usage.usedBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
      console.log(`   - Free Storage:  ${(Number(usage.freeBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB\n`);
    } catch (e) {
      console.warn('âš ï¸ Token test encountered notice:', e);
    }
  }

  const authUrl = getOneDriveAuthUrl(REDIRECT_URI);

  console.log('ðŸ‘‰ To link your Microsoft account, open this URL in your browser:');
  console.log(`\nðŸ”— ${authUrl}\n`);
  console.log(`â³ Temporary callback listener active on ${REDIRECT_URI} ...`);

  const server = http.createServer(async (req, res) => {
    const fullReqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (fullReqUrl.pathname === CALLBACK_PATH || fullReqUrl.pathname === '/callback' || fullReqUrl.pathname === '/api/storage/onedrive/callback') {
      const code = fullReqUrl.searchParams.get('code');

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization Error</h1><p>No authorization code received.</p>');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: sans-serif; background: #0b0f19; color: #fff; text-align: center; padding: 50px;">
            <h1 style="color: #00bcd4;">CloudFusion Microsoft OneDrive Connected!</h1>
            <p>Authorization tokens received and verified. You can now close this tab and return to your terminal.</p>
          </body>
        </html>
      `);

      console.log('\nðŸ“¥ Received Authorization Code! Exchanging for tokens...');
      const tokens = await exchangeOneDriveCode(code, REDIRECT_URI);

      if (tokens && tokens.refreshToken) {
        console.log('âœ… Access Token & Refresh Token obtained successfully!');
        console.log(`ðŸ”‘ Refresh Token: ${tokens.refreshToken.substring(0, 20)}...`);

        // Save to .env file
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');
          if (envContent.includes('ONEDRIVE_REFRESH_TOKEN=')) {
            envContent = envContent.replace(
              /ONEDRIVE_REFRESH_TOKEN=.*/g,
              `ONEDRIVE_REFRESH_TOKEN=${tokens.refreshToken}`
            );
          } else {
            envContent += `\nONEDRIVE_REFRESH_TOKEN=${tokens.refreshToken}\n`;
          }
          fs.writeFileSync(envPath, envContent, 'utf8');
          console.log('ðŸ’¾ Saved ONEDRIVE_REFRESH_TOKEN to .env file!');
        }

        process.env.ONEDRIVE_REFRESH_TOKEN = tokens.refreshToken;

        // Test live storage
        console.log('\nðŸ“Š Fetching Live OneDrive Quota Metrics...');
        const usage = await getOneDriveStorageUsage();
        console.log(`   - Owner: ${usage.userName || 'Unknown'} (${usage.userEmail || 'N/A'})`);
        console.log(`   - Total Storage: ${(Number(usage.totalBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
        console.log(`   - Used Storage:  ${(Number(usage.usedBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
        console.log(`   - Free Storage:  ${(Number(usage.freeBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);

        console.log('\nðŸŽ‰ Setup Complete! CloudFusion Multi-Cloud Mesh is ready.\n');
      } else {
        console.error('âŒ Failed to retrieve refresh token from Microsoft.');
      }

      server.close();
      process.exit(0);
    }
  });

  server.listen(PORT, () => {
    console.log(`[HTTP] Server listening on port ${PORT}...`);
  });
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
