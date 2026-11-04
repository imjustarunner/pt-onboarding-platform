import mysql from 'mysql2/promise';
import crypto from 'node:crypto';

export const recoveryMysqlEnabled = !!process.env.RECOVERY_TEST_MYSQL_HOST;

/** Never uses DB_* or dotenv: those may point at a production tunnel. */
export async function isolatedWorkflowMysql(prefix) {
  const host = process.env.RECOVERY_TEST_MYSQL_HOST;
  const port = Number(process.env.RECOVERY_TEST_MYSQL_PORT);
  if (host !== '127.0.0.1' || ![33319, 33316].includes(port)) {
    throw new Error('Explicit isolated loopback MySQL on port33319 or33316 is required.');
  }
  if (!/^[a-z_]+$/.test(prefix)) throw new Error('Unsafe fixture prefix.');
  const schema = `${prefix}_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;
  const connection = { host, port, user: 'root', password: '', timezone: 'Z' };
  const admin = await mysql.createConnection(connection);
  await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const db = mysql.createPool({ ...connection, database: schema, connectionLimit: 8 });
  return {
    db,
    async close() {
      await db.end();
      await admin.query(`DROP DATABASE ${schema}`);
      await admin.end();
    }
  };
}
