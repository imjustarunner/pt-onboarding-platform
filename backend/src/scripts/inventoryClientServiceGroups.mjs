import pool from '../config/database.js';
import { inventoryClientServiceGroups } from '../services/clientServiceGroupInventory.service.js';

const agencyId = Number(process.argv[2]);
let connection;
try {
  if (process.argv.length !== 3 || !Number.isSafeInteger(agencyId) || agencyId < 1) {
    throw new Error('Usage: node src/scripts/inventoryClientServiceGroups.mjs AGENCY_ID');
  }
  connection = await pool.getConnection();
  await connection.query('START TRANSACTION READ ONLY');
  const groups = await inventoryClientServiceGroups(connection, agencyId);
  await connection.commit();
  console.log(JSON.stringify({agencyId, groups}, null, 2));
} catch (error) {
  if (connection) await connection.rollback();
  console.error(error.code || error.message);
  process.exitCode = 1;
} finally {
  connection?.release();
  await pool.end();
}
