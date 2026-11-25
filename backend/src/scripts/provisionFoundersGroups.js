import pool from '../config/database.js';
import { provisionFoundersGroups } from '../services/foundersGroupProvisioning.service.js';

const value = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
try {
  const apply = process.argv.includes('--apply');
  const plans = await provisionFoundersGroups({ melissa: value('melissa'), michael: value('michael'), apply });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', groups: plans }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
