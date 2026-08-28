import dotenv from 'dotenv';
import { Dropbox } from 'dropbox';

dotenv.config();

async function testDropbox() {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  console.log('Testing Dropbox token...');
  console.log('Token length:', token ? token.length : 0);
  console.log('Token preview:', token ? token.substring(0, 15) + '...' : 'NONE');

  if (!token) {
    console.error('âŒ No DROPBOX_ACCESS_TOKEN found in .env');
    return;
  }

  const dbx = new Dropbox({ accessToken: token });
  try {
    const user = await dbx.usersGetCurrentAccount();
    console.log('âœ… Dropbox Account Connected Successfully!');
    console.log('   - Name:', user.result.name.display_name);
    console.log('   - Email:', user.result.email);

    const space = await dbx.usersGetSpaceUsage();
    console.log('   - Used:', (space.result.used / (1024 * 1024)).toFixed(2), 'MB');
    const allocated = (space.result.allocation as any)?.individual?.allocated;
    if (allocated) {
      console.log('   - Allocated:', (allocated / (1024 * 1024 * 1024)).toFixed(2), 'GB');
    }
  } catch (err: any) {
    console.error('âŒ Dropbox connection error:');
    if (err.error) {
      console.error(JSON.stringify(err.error, null, 2));
    } else {
      console.error(err.message || err);
    }
  }
}

testDropbox();
